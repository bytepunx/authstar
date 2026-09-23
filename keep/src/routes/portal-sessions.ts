import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { CustomerState } from '../actors/customer_actor.js'
import { scopesEqual } from '../lib/scope.js'
import { requireOrganizationAccess } from '../lib/permissions.js'

const accountParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'accountId'],
  properties: { tenantSlug: { type: 'string' }, accountId: { type: 'string' } },
} as const

const accountPortalBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['returnUrl'],
  properties: {
    returnUrl: { type: 'string', minLength: 1 },
  },
} as const

// Per design/decisions/0090-organizations-shared-billing-administration-
// and-succession.md. Unlike checkout-sessions.ts, there's no implicit-
// customer-creation fallback -- the Billing Portal requires an existing
// Stripe Customer, and an organization only ever gets one via a real
// checkout (checkout-sessions.ts, scope: {organization}).

const organizationParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'organizationId'],
  properties: { tenantSlug: { type: 'string' }, organizationId: { type: 'string' } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['returnUrl'],
  properties: {
    returnUrl: { type: 'string', minLength: 1 },
  },
} as const

async function findOrganizationCustomer(app: FastifyInstance, tenantSlug: string, organizationId: string): Promise<CustomerState | undefined> {
  // Same in-memory-search-adapter workaround every other scope lookup in
  // this codebase uses (src/lib/scope.ts's own header comment) -- find by
  // the indexed scalar `tenant` field, filter to the matching scope in
  // application code.
  const instances = await app.consequent.find('customer', searchCriteria({ tenant: tenantSlug }))
  const customers = instances.map((i) => i.state as unknown as CustomerState)
  return customers.find((c) => scopesEqual(c.scope, { organization: organizationId }))
}

const portalSessionRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  // ADR 0070 self-action: an account can open a portal session for itself.
  app.post(
    '/tenants/:tenantSlug/accounts/:accountId/portal-sessions',
    { schema: { params: accountParamsSchema, body: accountPortalBodySchema } },
    async (request, reply) => {
      const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
      const { returnUrl } = request.body as { returnUrl: string }

      const claims = request.authstar
      const isSelfAction = claims?.accountId === accountId
      if (!isSelfAction) {
        const authorized = claims?.enrichmentStatus === 'ok' && claims.permissions.includes('billing:manage')
        if (!authorized) return reply.code(403).send({ error: 'forbidden' })
      }

      const config = await app.stripeConfig.get(tenantSlug)
      if (!config) {
        return reply.code(409).send({ error: 'tenant has no stripe configuration' })
      }

      const instances = await app.consequent.find('customer', searchCriteria({ tenant: tenantSlug }))
      const customers = instances.map((i) => i.state as unknown as CustomerState)
      const customer = customers.find((c) => scopesEqual(c.scope, { account: accountId }))
      if (!customer) {
        return reply.code(404).send({ error: 'account has no stripe customer yet' })
      }

      const client = app.stripeClients.dial(config.secretKey)
      const session = await client.createPortalSession({ stripeCustomerId: customer.stripeCustomerId, returnUrl })

      return reply.code(201).send({ url: session.url })
    },
  )

  app.post(
    '/tenants/:tenantSlug/organizations/:organizationId/portal-sessions',
    { schema: { params: organizationParamsSchema, body: createBodySchema }, preHandler: requireOrganizationAccess() },
    async (request, reply) => {
      const { tenantSlug, organizationId } = request.params as { tenantSlug: string, organizationId: string }
      const { returnUrl } = request.body as { returnUrl: string }

      const config = await app.stripeConfig.get(tenantSlug)
      if (!config) {
        return reply.code(409).send({ error: 'tenant has no stripe configuration' })
      }

      const customer = await findOrganizationCustomer(app, tenantSlug, organizationId)
      if (!customer) {
        return reply.code(404).send({ error: 'organization has no stripe customer yet' })
      }

      const client = app.stripeClients.dial(config.secretKey)
      const session = await client.createPortalSession({ stripeCustomerId: customer.stripeCustomerId, returnUrl })

      return reply.code(201).send({ url: session.url })
    },
  )
}

export default portalSessionRoutes
