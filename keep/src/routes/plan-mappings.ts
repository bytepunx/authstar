import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { PlanMappingState, GrantedRole, ApiKeyRateLimit } from '../actors/plan_mapping_actor.js'
import generateId from '../lib/ids.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/keep/003-plan-mappings-checkout-and-billing-reads.md.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const idParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'id'],
  properties: { tenantSlug: { type: 'string' }, id: { type: 'string' } },
} as const

const grantedRoleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['application', 'role'],
  properties: {
    application: { type: 'string', minLength: 1 },
    role: { type: 'string', minLength: 1 },
  },
} as const

const apiKeyRateLimitSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requestsPerMinute'],
  properties: {
    requestsPerMinute: { type: 'integer', minimum: 1 },
    burst: { type: 'integer', minimum: 1 },
  },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['stripePriceId', 'name'],
  properties: {
    stripePriceId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    seatLimit: { type: ['integer', 'null'], minimum: 1 },
    grantedRoles: { type: 'array', items: grantedRoleSchema },
    meter: { type: ['string', 'null'] },
    apiKeyLimit: { type: ['integer', 'null'], minimum: 0 },
    apiKeyRateLimit: { oneOf: [apiKeyRateLimitSchema, { type: 'null' }] },
  },
} as const

const updateBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    seatLimit: { type: ['integer', 'null'], minimum: 1 },
    grantedRoles: { type: 'array', items: grantedRoleSchema },
    meter: { type: ['string', 'null'] },
    apiKeyLimit: { type: ['integer', 'null'], minimum: 0 },
    apiKeyRateLimit: { oneOf: [apiKeyRateLimitSchema, { type: 'null' }] },
  },
} as const

const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['active', 'retired', 'all'] },
  },
} as const

// A plan mapping that was never created still has a valid-shaped,
// all-default PlanMappingState (consequent's getOrCreate returns the actor
// module's own default `state` rather than null) -- `createdAt` is the one
// field only the `created` event handler ever sets, the same sentinel
// tower's own tenant_actor uses to distinguish "exists" from "never
// created."
function exists(state: PlanMappingState): boolean {
  return Boolean(state.createdAt)
}

async function fetchMapping(app: FastifyInstance, id: string): Promise<PlanMappingState> {
  const instance = await app.consequent.fetch('planMapping', id)
  return instance!.state as unknown as PlanMappingState
}

function toResponse(state: PlanMappingState) {
  const { createdAt: _createdAt, ...rest } = state
  return rest
}

const planMappingRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/plan-mappings', { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as {
      stripePriceId: string
      name: string
      seatLimit?: number | null
      grantedRoles?: GrantedRole[]
      meter?: string | null
      apiKeyLimit?: number | null
      apiKeyRateLimit?: ApiKeyRateLimit | null
    }

    const grantedRoles = body.grantedRoles ?? []
    await app.roleBackfill.ensureFresh(tenantSlug)
    const validation = app.roleCache.validateAll(tenantSlug, grantedRoles)
    if (!validation.valid) {
      return reply.code(400).send({ error: 'grantedRoles references an unknown or inactive application/role', invalid: validation.invalid })
    }

    const config = await app.stripeConfig.get(tenantSlug)
    if (!config) {
      return reply.code(409).send({ error: 'tenant has no stripe configuration' })
    }

    const client = app.stripeClients.dial(config.secretKey)
    let price
    try {
      price = await client.getPrice(body.stripePriceId)
    } catch {
      return reply.code(400).send({ error: 'stripePriceId could not be resolved against the tenant\'s Stripe account' })
    }

    const id = generateId()
    const results = await app.consequent.handle(id, 'planMapping.create', {
      id,
      tenant: tenantSlug,
      stripePriceId: body.stripePriceId,
      name: body.name,
      seatLimit: body.seatLimit ?? null,
      grantedRoles,
      meter: body.meter ?? null,
      apiKeyLimit: body.apiKeyLimit ?? null,
      apiKeyRateLimit: body.apiKeyRateLimit ?? null,
      unitAmount: price.unitAmount,
      currency: price.currency,
      interval: price.interval,
    })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const created = await fetchMapping(app, id)
    return reply.code(201).send(toResponse(created))
  })

  app.get('/tenants/:tenantSlug/plan-mappings', { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requirePermission('billing:manage') }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { status } = request.query as { status?: 'active' | 'retired' | 'all' }

    const instances = await app.consequent.find('planMapping', searchCriteria({ tenant: tenantSlug }))
    const mappings = instances.map((i) => i.state as unknown as PlanMappingState).filter(exists)

    const filterStatus = status ?? 'active'
    const filtered = filterStatus === 'all' ? mappings : mappings.filter((m) => m.status === filterStatus)

    return filtered.map(toResponse)
  })

  app.get('/tenants/:tenantSlug/plan-mappings/:id', { schema: { params: idParamsSchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const state = await fetchMapping(app, id)
    if (!exists(state) || state.tenant !== tenantSlug) {
      return reply.code(404).send()
    }
    return toResponse(state)
  })

  app.patch('/tenants/:tenantSlug/plan-mappings/:id', { schema: { params: idParamsSchema, body: updateBodySchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const body = request.body as {
      name?: string
      seatLimit?: number | null
      grantedRoles?: GrantedRole[]
      meter?: string | null
      apiKeyLimit?: number | null
      apiKeyRateLimit?: ApiKeyRateLimit | null
    }

    const current = await fetchMapping(app, id)
    if (!exists(current) || current.tenant !== tenantSlug) {
      return reply.code(404).send()
    }

    if (body.grantedRoles !== undefined) {
      await app.roleBackfill.ensureFresh(tenantSlug)
      const validation = app.roleCache.validateAll(tenantSlug, body.grantedRoles)
      if (!validation.valid) {
        return reply.code(400).send({ error: 'grantedRoles references an unknown or inactive application/role', invalid: validation.invalid })
      }
    }

    const results = await app.consequent.handle(id, 'planMapping.update', {
      name: body.name,
      seatLimit: body.seatLimit,
      grantedRoles: body.grantedRoles,
      meter: body.meter,
      apiKeyLimit: body.apiKeyLimit,
      apiKeyRateLimit: body.apiKeyRateLimit,
    })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const updated = await fetchMapping(app, id)
    return toResponse(updated)
  })

  app.delete('/tenants/:tenantSlug/plan-mappings/:id', { schema: { params: idParamsSchema }, preHandler: requirePermission('billing:manage') }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const current = await fetchMapping(app, id)
    if (!exists(current) || current.tenant !== tenantSlug) {
      return reply.code(404).send()
    }

    const results = await app.consequent.handle(id, 'planMapping.retire', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const updated = await fetchMapping(app, id)
    return toResponse(updated)
  })
}

export default planMappingRoutes
