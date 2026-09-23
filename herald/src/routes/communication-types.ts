import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { CommunicationTypeState } from '../actors/communication_type_actor.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/herald/003-communication-types-and-templates.md.
// Gated by `communication-types:manage` (Story 006).

async function fetchType(app: FastifyInstance, tenantSlug: string, type: string): Promise<CommunicationTypeState> {
  const instance = await app.consequent.fetch('communicationType', `${tenantSlug}:${type}`)
  return instance!.state as unknown as CommunicationTypeState
}

function exists(state: CommunicationTypeState): boolean {
  return Boolean(state.type)
}

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const typeParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'type'],
  properties: { tenantSlug: { type: 'string' }, type: { type: 'string' } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type'],
  properties: {
    type: { type: 'string', minLength: 1 },
    category: { type: 'string', enum: ['transactional', 'marketing'] },
    retentionDays: { type: 'integer', minimum: 1 },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: ['transactional', 'marketing'] },
    retentionDays: { type: 'integer', minimum: 1 },
    // "active" is deliberately absent -- reactivating a deprecated type is
    // structurally unreachable through this route, not merely rejected
    // (same discipline as tower's tenant status enum, Story 003/ADR 0053).
    status: { type: 'string', enum: ['deprecated'] },
  },
} as const

const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    includeDeprecated: { type: 'boolean' },
  },
} as const

const communicationTypeRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/communication-types', { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('communication-types:manage') }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as { type: string, category?: 'transactional' | 'marketing', retentionDays?: number }

    const results = await app.consequent.handle(`${tenantSlug}:${body.type}`, 'communicationType.create', {
      type: body.type,
      tenant: tenantSlug,
      category: body.category,
      retentionDays: body.retentionDays,
    })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const state = await fetchType(app, tenantSlug, body.type)
    return reply.code(201).send(state)
  })

  app.get('/tenants/:tenantSlug/communication-types', { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requirePermission('communication-types:manage') }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { includeDeprecated } = request.query as { includeDeprecated?: boolean }

    const criteria: Record<string, unknown> = { tenant: tenantSlug }
    if (!includeDeprecated) {
      criteria.status = 'active'
    }
    // Criteria wrapped in an array -- see the fuller note in
    // `src/lib/template-lookup.ts#templatesFor` for why (`consequent-
    // postgres`'s real search adapter requires it despite the published
    // type).
    const instances = await app.consequent.find('communicationType', [criteria] as unknown as Record<string, unknown>)
    return instances.map((i) => i.state)
  })

  app.get('/tenants/:tenantSlug/communication-types/:type', { schema: { params: typeParamsSchema }, preHandler: requirePermission('communication-types:manage') }, async (request, reply) => {
    const { tenantSlug, type } = request.params as { tenantSlug: string, type: string }
    const state = await fetchType(app, tenantSlug, type)
    if (!exists(state)) {
      return reply.code(404).send()
    }
    return state
  })

  app.patch('/tenants/:tenantSlug/communication-types/:type', { schema: { params: typeParamsSchema, body: patchBodySchema }, preHandler: requirePermission('communication-types:manage') }, async (request, reply) => {
    const { tenantSlug, type } = request.params as { tenantSlug: string, type: string }
    const body = request.body as { category?: 'transactional' | 'marketing', retentionDays?: number, status?: 'deprecated' }

    const current = await fetchType(app, tenantSlug, type)
    if (!exists(current)) {
      return reply.code(404).send()
    }

    if (body.category !== undefined || body.retentionDays !== undefined) {
      const results = await app.consequent.handle(`${tenantSlug}:${type}`, 'communicationType.update', {
        category: body.category,
        retentionDays: body.retentionDays,
      })
      const rejection = results.find((r) => r?.rejected)
      if (rejection) {
        return reply.code(409).send({ error: rejection.reason?.message })
      }
    }

    if (body.status === 'deprecated') {
      const results = await app.consequent.handle(`${tenantSlug}:${type}`, 'communicationType.deprecate', {})
      const rejection = results.find((r) => r?.rejected)
      if (rejection) {
        return reply.code(409).send({ error: rejection.reason?.message })
      }
    }

    const updated = await fetchType(app, tenantSlug, type)
    return updated
  })

  // DELETE is an alias for PATCH { status: "deprecated" } (ADR 0053, Story
  // 003) -- historical `communication` records referencing this type stay
  // meaningful, never orphaned.
  app.delete('/tenants/:tenantSlug/communication-types/:type', { schema: { params: typeParamsSchema }, preHandler: requirePermission('communication-types:manage') }, async (request, reply) => {
    const { tenantSlug, type } = request.params as { tenantSlug: string, type: string }

    const current = await fetchType(app, tenantSlug, type)
    if (!exists(current)) {
      return reply.code(404).send()
    }

    const results = await app.consequent.handle(`${tenantSlug}:${type}`, 'communicationType.deprecate', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const updated = await fetchType(app, tenantSlug, type)
    return updated
  })
}

export default communicationTypeRoutes
