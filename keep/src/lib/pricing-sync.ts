import { searchCriteria, type ConsequentApi } from './consequent-types.js'
import type { StripeClientFactory } from './stripe-client.js'
import type { StripeConfigStore } from './stripe-config.js'
import type { PlanMappingState } from '../actors/plan_mapping_actor.js'

// Per design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md's
// "Periodic pricing re-sync" section: re-fetches `unitAmount`/`currency`/
// `interval` from Stripe for every *active* `planMapping` and updates the
// cache (via the existing `planMapping.syncPricing` command, previously
// unused by anything) if Stripe's own value has changed. Keeps
// `revenue-summary` (billing-reads.ts) from silently drifting from what
// Stripe actually charges.
//
// This is the run-once, testable core -- called by `src/sync-pricing.ts`'s
// standalone CronJob entrypoint (real signet/Postgres/Stripe wiring, no
// fastify server) once per firing. No pagination/rate-limit backoff here:
// installations at this pilot's scale don't need it yet, and `stripe`'s own
// SDK already retries transient network failures internally -- a genuine
// limit worth revisiting is flagged in TESTING.md, not silently absorbed by
// over-engineering this pass.
export interface PlanMappingPricingSyncResult {
  checked: number
  updated: number
  errors: Array<{ id: string, tenant: string, error: string }>
}

function pricingChanged(mapping: PlanMappingState, price: { unitAmount: number, currency: string, interval: string }): boolean {
  return mapping.unitAmount !== price.unitAmount || mapping.currency !== price.currency || mapping.interval !== price.interval
}

export async function syncAllPlanMappingPricing(
  consequent: ConsequentApi,
  stripeClients: StripeClientFactory,
  stripeConfig: StripeConfigStore,
  log: (message: string) => void = () => {},
): Promise<PlanMappingPricingSyncResult> {
  const instances = await consequent.find('planMapping', searchCriteria({ status: 'active' }))
  const mappings = instances
    .map((i) => i.state as unknown as PlanMappingState)
    .filter((m) => Boolean(m.createdAt))

  const result: PlanMappingPricingSyncResult = { checked: 0, updated: 0, errors: [] }

  for (const mapping of mappings) {
    result.checked += 1
    try {
      const config = await stripeConfig.get(mapping.tenant)
      if (!config) {
        result.errors.push({ id: mapping.id, tenant: mapping.tenant, error: 'tenant has no stripe configuration' })
        continue
      }

      const client = stripeClients.dial(config.secretKey)
      const price = await client.getPrice(mapping.stripePriceId)

      if (pricingChanged(mapping, price)) {
        const results = await consequent.handle(mapping.id, 'planMapping.syncPricing', {
          unitAmount: price.unitAmount,
          currency: price.currency,
          interval: price.interval,
        })
        const rejection = results.find((r) => r?.rejected)
        if (rejection) {
          result.errors.push({ id: mapping.id, tenant: mapping.tenant, error: rejection.reason?.message ?? 'rejected' })
          continue
        }
        result.updated += 1
        log(`plan mapping ${mapping.id} (${mapping.tenant}): ${mapping.unitAmount} ${mapping.currency}/${mapping.interval} -> ${price.unitAmount} ${price.currency}/${price.interval}`)
      }
    } catch (err) {
      // One tenant's bad Stripe key, a deleted price, a transient network
      // failure -- none of it should stop the sweep from covering every
      // other mapping. Collected and reported, not thrown.
      result.errors.push({ id: mapping.id, tenant: mapping.tenant, error: (err as Error).message })
    }
  }

  return result
}
