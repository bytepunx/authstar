import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { PlanMappingState } from '../actors/plan_mapping_actor.js'
import type { CustomerState } from '../actors/customer_actor.js'
import { scopesEqual, type Scope } from '../lib/scope.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md
// ("Checkout Sessions"). Resolves the matching `customer` record (Story
// 001) for the given scope *before* creating the session -- a second
// checkout for the same customer reuses their existing Stripe Customer
// object rather than creating a duplicate. The very first checkout for a
// scope has no `customer` record yet at all (that only gets created by
// Story 002's webhook handling on the first completed checkout) -- this
// route passes `customerEmail` to Stripe in that case and lets Stripe
// create the Customer object implicitly.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

// See routes/trials.ts's identical `scopeSchema` for why there's no
// top-level `additionalProperties: false` alongside `oneOf` here.
const scopeSchema = {
  type: 'object',
  oneOf: [
    { additionalProperties: false, required: ['account'], properties: { account: { type: 'string', minLength: 1 } } },
    { additionalProperties: false, required: ['tenant'], properties: { tenant: { type: 'string', minLength: 1 } } },
  ],
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['planMappingId', 'scope', 'successUrl', 'cancelUrl'],
  properties: {
    planMappingId: { type: 'string', minLength: 1 },
    scope: scopeSchema,
    customerEmail: { type: 'string' },
    successUrl: { type: 'string', minLength: 1 },
    cancelUrl: { type: 'string', minLength: 1 },
  },
} as const

async function findExistingCustomer(app: FastifyInstance, tenantSlug: string, scope: Scope): Promise<CustomerState | undefined> {
  // consequent's in-memory search adapter can't index an object-valued
  // field (`scope`) meaningfully -- find by the indexed scalar `tenant`
  // field and filter to the matching scope in application code (see
  // src/lib/scope.ts).
  const instances = await app.consequent.find('customer', searchCriteria({ tenant: tenantSlug }))
  const customers = instances.map((i) => i.state as unknown as CustomerState)
  return customers.find((c) => scopesEqual(c.scope, scope))
}

const checkoutSessionRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/checkout-sessions', { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as { planMappingId: string, scope: Scope, customerEmail?: string, successUrl: string, cancelUrl: string }

    const mappingInstance = await app.consequent.fetch('planMapping', body.planMappingId)
    const mapping = mappingInstance!.state as unknown as PlanMappingState
    if (!mapping.createdAt || mapping.tenant !== tenantSlug) {
      return reply.code(404).send({ error: 'plan mapping not found' })
    }
    if (mapping.status !== 'active') {
      return reply.code(409).send({ error: 'plan mapping is retired' })
    }

    const config = await app.stripeConfig.get(tenantSlug)
    if (!config) {
      return reply.code(409).send({ error: 'tenant has no stripe configuration' })
    }

    const existingCustomer = await findExistingCustomer(app, tenantSlug, body.scope)

    const client = app.stripeClients.dial(config.secretKey)
    const session = await client.createCheckoutSession({
      stripePriceId: mapping.stripePriceId,
      stripeCustomerId: existingCustomer?.stripeCustomerId,
      customerEmail: existingCustomer ? undefined : body.customerEmail,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      metadata: { scope: JSON.stringify(body.scope) },
    })

    return reply.code(201).send({ id: session.id, url: session.url })
  })
}

export default checkoutSessionRoutes
