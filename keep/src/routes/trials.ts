import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { TrialState, GrantedRole } from '../actors/trial_actor.js'
import type { Scope } from '../lib/scope.js'
import generateId from '../lib/ids.js'

// Per design/stories/keep/004-trials-and-coupons.md ("Trials").
// Conversion (trial -> converted) is a side effect of Story 002's webhook
// handling, not a route here.

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

// No top-level `additionalProperties: false` here -- AJV only reconciles
// `additionalProperties` against a *sibling* `properties`/`patternProperties`
// at the same schema level, not properties declared inside `oneOf`
// branches. A top-level `additionalProperties: false` alongside `oneOf` (no
// sibling `properties`) rejects every field unconditionally -- confirmed by
// actually running this against a valid `{ account: '...' }` body and
// getting a 400 ("must NOT have additional properties") for the one field
// the schema exists to allow. Each `oneOf` branch already declares its own
// `additionalProperties: false`, which is where that restriction actually
// belongs.
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
  required: ['scope', 'expiresAt'],
  properties: {
    scope: scopeSchema,
    grantedRoles: { type: 'array', items: grantedRoleSchema },
    seatLimit: { type: ['integer', 'null'], minimum: 1 },
    expiresAt: { type: 'string', minLength: 1 },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['expiresAt'],
  properties: {
    expiresAt: { type: 'string', minLength: 1 },
  },
} as const

const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['active', 'converted', 'expired'] },
  },
} as const

async function fetchTrial(app: FastifyInstance, id: string): Promise<TrialState> {
  const instance = await app.consequent.fetch('trial', id)
  return instance!.state as unknown as TrialState
}

function exists(state: TrialState): boolean {
  return Boolean(state.createdAt)
}

function toResponse(state: TrialState) {
  const { createdAt: _createdAt, ...rest } = state
  return rest
}

const trialRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/trials', { schema: { params: tenantParamsSchema, body: createBodySchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as { scope: Scope, grantedRoles?: GrantedRole[], seatLimit?: number | null, expiresAt: string }

    const grantedRoles = body.grantedRoles ?? []
    const validation = app.roleCache.validateAll(grantedRoles)
    if (!validation.valid) {
      return reply.code(400).send({ error: 'grantedRoles references an unknown or inactive application/role', invalid: validation.invalid })
    }

    const id = generateId()
    await app.consequent.handle(id, 'trial.create', {
      id,
      tenant: tenantSlug,
      scope: body.scope,
      grantedRoles,
      seatLimit: body.seatLimit ?? null,
      expiresAt: body.expiresAt,
    })

    // `entitlement.trial-granted` -- one per role (Story 004, same
    // discrete-event family as `role-granted`, ADR 0031).
    for (const role of grantedRoles) {
      const sequence = app.sequences.next(tenantSlug, body.scope)
      await app.entitlements.publish({
        type: 'entitlement.trial-granted',
        tenant: tenantSlug,
        scope: body.scope,
        sequence,
        role: { name: role.role, scope: role.application },
      })
    }

    const created = await fetchTrial(app, id)
    return reply.code(201).send(toResponse(created))
  })

  app.get('/tenants/:tenantSlug/trials', { schema: { params: tenantParamsSchema, querystring: listQuerySchema } }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { status } = request.query as { status?: 'active' | 'converted' | 'expired' }
    const instances = await app.consequent.find('trial', searchCriteria({ tenant: tenantSlug }))
    const trials = instances.map((i) => i.state as unknown as TrialState).filter(exists)
    const filtered = status ? trials.filter((t) => t.status === status) : trials
    return filtered.map(toResponse)
  })

  app.get('/tenants/:tenantSlug/trials/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const state = await fetchTrial(app, id)
    if (!exists(state) || state.tenant !== tenantSlug) return reply.code(404).send()
    return toResponse(state)
  })

  app.patch('/tenants/:tenantSlug/trials/:id', { schema: { params: idParamsSchema, body: patchBodySchema } }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const body = request.body as { expiresAt: string }

    const current = await fetchTrial(app, id)
    if (!exists(current) || current.tenant !== tenantSlug) return reply.code(404).send()

    const results = await app.consequent.handle(id, 'trial.extend', { by: 'admin', newExpiresAt: body.expiresAt })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

    const sequence = app.sequences.next(tenantSlug, current.scope)
    await app.entitlements.publish({
      type: 'entitlement.trial-extended',
      tenant: tenantSlug,
      scope: current.scope,
      sequence,
      newExpiresAt: body.expiresAt,
    })

    const updated = await fetchTrial(app, id)
    return toResponse(updated)
  })

  app.delete('/tenants/:tenantSlug/trials/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
    const current = await fetchTrial(app, id)
    if (!exists(current) || current.tenant !== tenantSlug) return reply.code(404).send()

    const results = await app.consequent.handle(id, 'trial.expire', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

    for (const role of current.grantedRoles) {
      const sequence = app.sequences.next(tenantSlug, current.scope)
      await app.entitlements.publish({
        type: 'entitlement.role-revoked',
        tenant: tenantSlug,
        scope: current.scope,
        sequence,
        role: { name: role.role, scope: role.application },
      })
    }

    const updated = await fetchTrial(app, id)
    return toResponse(updated)
  })
}

export default trialRoutes
