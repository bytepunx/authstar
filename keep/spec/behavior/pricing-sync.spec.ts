import { describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createFakeStripeClientFactory, createFakeStripeState } from '../lib/fake-stripe-client.js'
import { createInMemoryStripeConfigStore } from '../../src/lib/stripe-config.js'
import { syncAllPlanMappingPricing } from '../../src/lib/pricing-sync.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import generateId from '../../src/lib/ids.js'

// Behavior tier for the periodic pricing re-sync job (design/stories/keep/
// 003's "Periodic pricing re-sync" section). Tests the run-once core
// directly (`syncAllPlanMappingPricing`) -- the standalone CronJob
// entrypoint that calls this against real signet/Postgres/Stripe has no
// test coverage of its own, consistent with how every other authstar
// service's own entrypoint is scoped (see TESTING.md).

async function createActiveMapping(consequent: ConsequentApi, overrides: {
  tenant: string
  stripePriceId: string
  unitAmount: number
  currency: string
  interval: 'month' | 'year'
}) {
  const id = generateId()
  await consequent.handle(id, 'planMapping.create', {
    id,
    tenant: overrides.tenant,
    stripePriceId: overrides.stripePriceId,
    name: 'Basic',
    seatLimit: null,
    grantedRoles: [],
    meter: null,
    unitAmount: overrides.unitAmount,
    currency: overrides.currency,
    interval: overrides.interval,
  })
  return id
}

describe('periodic plan-mapping pricing re-sync', () => {
  it('updates a mapping whose cached price has drifted from Stripe', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    stripeState.prices.set('price_basic', { unitAmount: 1500, currency: 'usd', interval: 'month' })

    const id = await createActiveMapping(consequent, { tenant: 'acme', stripePriceId: 'price_basic', unitAmount: 1000, currency: 'usd', interval: 'month' })

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result).toEqual({ checked: 1, updated: 1, errors: [] })
    const mapping = await consequent.fetch('planMapping', id)
    expect(mapping!.state.unitAmount).toBe(1500)
  })

  it('leaves an up-to-date mapping untouched', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'month' })

    await createActiveMapping(consequent, { tenant: 'acme', stripePriceId: 'price_basic', unitAmount: 1000, currency: 'usd', interval: 'month' })

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result).toEqual({ checked: 1, updated: 0, errors: [] })
  })

  it('detects a currency or interval change, not just unitAmount', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    stripeState.prices.set('price_basic', { unitAmount: 1000, currency: 'usd', interval: 'year' })

    const id = await createActiveMapping(consequent, { tenant: 'acme', stripePriceId: 'price_basic', unitAmount: 1000, currency: 'usd', interval: 'month' })

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result.updated).toBe(1)
    const mapping = await consequent.fetch('planMapping', id)
    expect(mapping!.state.interval).toBe('year')
  })

  it('never touches a retired mapping', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    stripeState.prices.set('price_basic', { unitAmount: 9999, currency: 'usd', interval: 'month' })

    const id = await createActiveMapping(consequent, { tenant: 'acme', stripePriceId: 'price_basic', unitAmount: 1000, currency: 'usd', interval: 'month' })
    await consequent.handle(id, 'planMapping.retire', {})

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result).toEqual({ checked: 0, updated: 0, errors: [] })
    const mapping = await consequent.fetch('planMapping', id)
    expect(mapping!.state.unitAmount).toBe(1000)
  })

  it('collects a per-mapping error and keeps syncing the rest, rather than aborting the sweep', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    stripeState.prices.set('price_good', { unitAmount: 2000, currency: 'usd', interval: 'month' })
    // price_missing deliberately never registered in stripeState.prices --
    // FakeStripeClient.getPrice throws "no such price" for it.

    const badId = await createActiveMapping(consequent, { tenant: 'acme', stripePriceId: 'price_missing', unitAmount: 1000, currency: 'usd', interval: 'month' })
    const goodId = await createActiveMapping(consequent, { tenant: 'acme', stripePriceId: 'price_good', unitAmount: 1000, currency: 'usd', interval: 'month' })

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result.checked).toBe(2)
    expect(result.updated).toBe(1)
    expect(result.errors).toEqual([{ id: badId, tenant: 'acme', error: 'no such price: price_missing' }])

    const good = await consequent.fetch('planMapping', goodId)
    expect(good!.state.unitAmount).toBe(2000)
  })

  it('records an error for a tenant with no stripe configuration, without throwing', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()
    // 'unconfigured' tenant deliberately never gets stripeConfig.set(...)

    const id = await createActiveMapping(consequent, { tenant: 'unconfigured', stripePriceId: 'price_basic', unitAmount: 1000, currency: 'usd', interval: 'month' })

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result).toEqual({
      checked: 1,
      updated: 0,
      errors: [{ id, tenant: 'unconfigured', error: 'tenant has no stripe configuration' }],
    })
  })

  it('syncs across multiple tenants independently, each against its own stripe config', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()
    await stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
    await stripeConfig.set('globex', { secretKey: 'sk_test_globex', webhookSecret: 'whsec_globex' })
    stripeState.prices.set('price_basic', { unitAmount: 3000, currency: 'usd', interval: 'month' })

    const acmeId = await createActiveMapping(consequent, { tenant: 'acme', stripePriceId: 'price_basic', unitAmount: 1000, currency: 'usd', interval: 'month' })
    const globexId = await createActiveMapping(consequent, { tenant: 'globex', stripePriceId: 'price_basic', unitAmount: 1000, currency: 'usd', interval: 'month' })

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result).toEqual({ checked: 2, updated: 2, errors: [] })
    expect((await consequent.fetch('planMapping', acmeId))!.state.unitAmount).toBe(3000)
    expect((await consequent.fetch('planMapping', globexId))!.state.unitAmount).toBe(3000)
  })

  it('is a no-op against an installation with no active plan mappings', async () => {
    const consequent = await buildInMemoryConsequent()
    const stripeState = createFakeStripeState()
    const stripeConfig = createInMemoryStripeConfigStore()

    const result = await syncAllPlanMappingPricing(consequent, createFakeStripeClientFactory(stripeState), stripeConfig)

    expect(result).toEqual({ checked: 0, updated: 0, errors: [] })
  })
})
