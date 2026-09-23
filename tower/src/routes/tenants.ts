import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import { requirePermission } from '../lib/permissions.js'

// `consequent.fetch()` resolves the full ActorInstance wrapper
// (`{ actor, state, ... }`), not the bare state -- confirmed against its
// actual type signature (Awaited<ReturnType<typeof initialize>>), not the
// simplified `const account = await system.fetch(...)` shorthand used in
// consequent's own README examples.
async function fetchTenantState(app: FastifyInstance, slug: string): Promise<TenantState> {
  const instance = await app.consequent.fetch('tenant', slug)
  return instance!.state as unknown as TenantState
}

// Per design/stories/tower/011-tenant-management-and-key-rotation.md.
// Only the tenant-scoped GET/PATCH from that story -- operator-scoped
// reactivation and key rotation are a different auth model, not
// implemented in this pilot slice.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    cookie: {
      type: 'object',
      additionalProperties: false,
      properties: {
        domain: { type: 'string' },
        path: { type: 'string' },
        maxAge: { type: 'integer', minimum: 1 },
        secure: { type: 'boolean' },
        // httpOnly is deliberately absent from this schema -- never
        // accepted, not merely rejected after the fact (ADR 0062).
      },
    },
    status: { type: 'string', enum: ['suspended'] },
    // "active" and "deleted" are deliberately absent from the enum --
    // structurally unreachable through this route, not merely rejected
    // by a permission check.
  },
} as const

// A tenant that was never created still has a valid-shaped, all-default
// TenantState (consequent's fetch/getOrCreate returns the actor module's
// own default `state` object rather than null) -- `createdAt` is the one
// field only our own `created` event handler ever sets, so its absence is
// the unambiguous "this tenant doesn't exist" signal.
function exists(state: TenantState): boolean {
  return Boolean(state.createdAt)
}

function toResponse(state: TenantState) {
  // Excludes `applications`/`providers` deliberately -- this detail view
  // isn't where a caller enumerates them, even though the same fetched
  // object technically has them (tower Story 011).
  const { applications: _applications, providers: _providers, ...rest } = state
  return rest
}

const tenantRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug', { schema: { params: tenantParamsSchema } }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const state = await fetchTenantState(app, tenantSlug)
    if (!exists(state)) {
      return reply.code(404).send()
    }
    return toResponse(state)
  })

  app.patch(
    '/tenants/:tenantSlug',
    { schema: { params: tenantParamsSchema, body: patchBodySchema }, preHandler: requirePermission('tenant:manage') },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const body = request.body as { name?: string, cookie?: Record<string, unknown>, status?: 'suspended' }

      const current = await fetchTenantState(app, tenantSlug)
      if (!exists(current)) {
        return reply.code(404).send()
      }

      if (body.name !== undefined || body.cookie !== undefined) {
        const results = await app.consequent.handle(tenantSlug, 'tenant.update', {
          name: body.name,
          cookie: body.cookie,
        })
        const rejection = results.find((r) => r?.rejected)
        if (rejection) {
          return reply.code(409).send({ error: rejection.reason?.message })
        }
      }

      if (body.status === 'suspended') {
        const results = await app.consequent.handle(tenantSlug, 'tenant.suspend', { status: 'suspended' })
        const rejection = results.find((r) => r?.rejected)
        if (rejection) {
          return reply.code(409).send({ error: rejection.reason?.message })
        }
      }

      const updated = await fetchTenantState(app, tenantSlug)
      return toResponse(updated)
    },
  )
}

export default tenantRoutes
