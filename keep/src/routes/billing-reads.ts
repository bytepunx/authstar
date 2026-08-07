import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { CustomerState } from '../actors/customer_actor.js'
import type { SubscriptionState } from '../actors/subscription_actor.js'
import type { RefundState } from '../actors/refund_actor.js'
import type { DisputeState } from '../actors/dispute_actor.js'
import type { PlanMappingState } from '../actors/plan_mapping_actor.js'
import { scopesEqual } from '../lib/scope.js'

// Per design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md
// ("Read-only billing surfaces"). `customer`/`subscription`/`refund`/
// `dispute` are entirely webhook-driven (Story 001/002) -- no write routes
// exist on any of these here at all.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const accountParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'accountId'],
  properties: { tenantSlug: { type: 'string' }, accountId: { type: 'string' } },
} as const

const idParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'id'],
  properties: { tenantSlug: { type: 'string' }, id: { type: 'string' } },
} as const

function toResponse<T extends { createdAt: string }>(state: T) {
  const { createdAt: _createdAt, ...rest } = state
  return rest
}

const billingReadRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/customer', { schema: { params: tenantParamsSchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const instances = await app.consequent.find('customer', searchCriteria({ tenant: tenantSlug }))
    const customer = instances.map((i) => i.state as unknown as CustomerState).find((c) => scopesEqual(c.scope, { tenant: tenantSlug }))
    if (!customer) return reply.code(404).send()
    return toResponse(customer)
  })

  app.get('/tenants/:tenantSlug/accounts/:accountId/customer', { schema: { params: accountParamsSchema } }, async (request, reply) => {
    const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
    const instances = await app.consequent.find('customer', searchCriteria({ tenant: tenantSlug }))
    const customer = instances.map((i) => i.state as unknown as CustomerState).find((c) => scopesEqual(c.scope, { account: accountId }))
    if (!customer) return reply.code(404).send()
    return toResponse(customer)
  })

  app.get('/tenants/:tenantSlug/subscriptions', { schema: { params: tenantParamsSchema } }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const instances = await app.consequent.find('subscription', searchCriteria({ tenant: tenantSlug }))
    return instances.map((i) => i.state as unknown as SubscriptionState).filter((s) => s.createdAt).map(toResponse)
  })

  app.get('/tenants/:tenantSlug/subscriptions/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const instance = await app.consequent.fetch('subscription', id)
    const state = instance!.state as unknown as SubscriptionState
    if (!state.createdAt || state.tenant !== tenantSlug) return reply.code(404).send()
    return toResponse(state)
  })

  app.get('/tenants/:tenantSlug/refunds', { schema: { params: tenantParamsSchema } }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const instances = await app.consequent.find('refund', searchCriteria({ tenant: tenantSlug }))
    return instances.map((i) => i.state as unknown as RefundState).filter((r) => r.createdAt).map(toResponse)
  })

  app.get('/tenants/:tenantSlug/disputes', { schema: { params: tenantParamsSchema } }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const instances = await app.consequent.find('dispute', searchCriteria({ tenant: tenantSlug }))
    return instances.map((i) => i.state as unknown as DisputeState).filter((d) => d.createdAt).map(toResponse)
  })

  // MRR + active-subscription counts by status/plan, computed from
  // `subscription` + `planMapping`'s cached pricing fields -- no live
  // Stripe call on read, the entire reason the pricing cache exists (Story
  // 003, ADR 0060). A yearly-interval plan's `unitAmount` is normalized to
  // a monthly figure (/12) so mixed-interval plans sum into one MRR number.
  app.get('/tenants/:tenantSlug/revenue-summary', { schema: { params: tenantParamsSchema } }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const [subscriptionInstances, mappingInstances] = await Promise.all([
      app.consequent.find('subscription', searchCriteria({ tenant: tenantSlug })),
      app.consequent.find('planMapping', searchCriteria({ tenant: tenantSlug })),
    ])
    const subscriptions = subscriptionInstances.map((i) => i.state as unknown as SubscriptionState).filter((s) => s.createdAt)
    const mappings = mappingInstances.map((i) => i.state as unknown as PlanMappingState).filter((m) => m.createdAt)
    const mappingByPriceId = new Map(mappings.map((m) => [m.stripePriceId, m]))

    let mrr = 0
    const byStatus: Record<string, number> = {}
    const byPlan: Record<string, number> = {}

    for (const sub of subscriptions) {
      byStatus[sub.status] = (byStatus[sub.status] ?? 0) + 1
      const mapping = mappingByPriceId.get(sub.stripePriceId)
      if (mapping) {
        byPlan[mapping.name] = (byPlan[mapping.name] ?? 0) + 1
        if (sub.status === 'active' && mapping.unitAmount !== null) {
          mrr += mapping.interval === 'year' ? mapping.unitAmount / 12 : mapping.unitAmount
        }
      }
    }

    return { mrr: Math.round(mrr), activeCount: byStatus.active ?? 0, byStatus, byPlan }
  })
}

export default billingReadRoutes
