import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { RoleDefinitionState } from '../actors/role_definition_actor.js'
import { requirePermission } from '../lib/permissions.js'
import { createKeyedMutex } from '../lib/mutex.js'
import { searchCriteria } from '../lib/consequent-types.js'

// Per design/decisions/0047-application-and-role-slug-validation.md and
// design/stories/tower/001-actor-definitions.md's `roleDefinition` section.
//
// Scope note: this file builds the role *catalog* itself -- creation,
// listing, retiring -- and the application-existence check ADR 0047
// requires at definition time. `routes/invites.ts`/`routes/invite-codes.ts`
// (Story 007) now validate their own `roles` arrays against this catalog
// at creation time, closing that half of ADR 0047's "role-granting write
// paths validate against the catalog" requirement. `POST /accounts/
// {accountId}/roles` still doesn't exist as a route in this repo -- the
// remaining gap, not this file's concern to close.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const roleDefParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'id'],
  properties: { tenantSlug: { type: 'string' }, id: { type: 'string' } },
} as const

const listQuerySchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['active', 'retired'] },
    // `scope=tenant` for tenant-wide-only, or an application slug to filter
    // to that application's own scoped role definitions -- matches ADR
    // 0051's "filterable by scope/status" without inventing a richer query
    // language than this admin-tool-scale need actually calls for.
    scope: { type: 'string' },
  },
} as const

const scopeSchema = {
  oneOf: [
    { type: 'string', enum: ['tenant'] },
    {
      type: 'object',
      additionalProperties: false,
      required: ['application'],
      properties: { application: { type: 'string', minLength: 1 } },
    },
  ],
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'scope'],
  properties: {
    name: { type: 'string', minLength: 1 },
    scope: scopeSchema,
    description: { type: 'string' },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // `name`/`scope` are deliberately absent -- both are embedded in the
    // actor's own composite key (ADR 0047), immutable after creation.
    description: { type: 'string' },
    status: { type: 'string', enum: ['retired'] },
    // "active" is deliberately absent -- reactivating a retired role
    // definition is structurally unreachable through this route, matching
    // `application`/`tenant`'s own no-reactivation-route posture.
  },
} as const

type Scope = 'tenant' | { application: string }

function keyFor(tenantSlug: string, name: string, scope: Scope): string {
  return scope === 'tenant' ? `${tenantSlug}:${name}` : `${tenantSlug}:${scope.application}:${name}`
}

async function fetchTenant(app: FastifyInstance, tenantSlug: string): Promise<TenantState> {
  const instance = await app.consequent.fetch('tenant', tenantSlug)
  return instance!.state as unknown as TenantState
}

function tenantExists(state: TenantState): boolean {
  return Boolean(state.createdAt)
}

async function fetchRoleDefinition(app: FastifyInstance, tenantSlug: string, id: string): Promise<RoleDefinitionState | null> {
  const instance = await app.consequent.fetch('roleDefinition', id)
  const state = instance?.state as unknown as RoleDefinitionState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug) return null
  return state
}

// ADR 0047: "Creating a roleDefinition with scope: {application} is where
// the application-slug check actually happens -- tower validates the
// referenced application exists at that moment." Must be an existing,
// *active* application under this same tenant -- a reference to an unknown,
// cross-tenant, or already-deleted application is rejected, not silently
// accepted (same bar `applications.ts`'s own `exposedProviders` validation
// already applies for the analogous provider-reference check).
async function scopeApplicationValid(app: FastifyInstance, tenantSlug: string, scope: Scope): Promise<boolean> {
  if (scope === 'tenant') return true
  const instance = await app.consequent.fetch('application', `${tenantSlug}:${scope.application}`)
  const state = instance?.state as unknown as ApplicationState | undefined
  return Boolean(state?.createdAt) && state?.status === 'active'
}

function toResponse(state: RoleDefinitionState) {
  return {
    tenant: state.tenant,
    name: state.name,
    scope: state.scope,
    description: state.description,
    status: state.status,
    createdAt: state.createdAt,
  }
}

// See `src/lib/mutex.ts`'s own header comment for why this exists: closes
// a real concurrent-duplicate-key race `consequent`'s own per-actor queue
// does not, by itself, prevent -- `roleDefinition.create`'s `doesNotExist`
// guard depends on a fetch step two concurrent `handle()` calls on the
// same key can both see stale, before either has persisted.
const roleDefinitionMutex = createKeyedMutex()

const roleDefinitionsRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/role-definitions',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema } },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const { status, scope } = request.query as { status?: 'active' | 'retired', scope?: string }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      const instances = await app.consequent.find('roleDefinition', searchCriteria({ tenant: tenantSlug }))
      const states = instances.map((i) => i.state as unknown as RoleDefinitionState)
      return states
        .filter((s) => !status || s.status === status)
        .filter((s) => {
          if (!scope) return true
          if (scope === 'tenant') return s.scope === 'tenant'
          return typeof s.scope === 'object' && s.scope.application === scope
        })
        .map(toResponse)
    },
  )

  app.get(
    '/tenants/:tenantSlug/role-definitions/:id',
    { schema: { params: roleDefParamsSchema } },
    async (request, reply) => {
      const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
      const state = await fetchRoleDefinition(app, tenantSlug, id)
      if (!state) return reply.code(404).send()
      return toResponse(state)
    },
  )

  app.post(
    '/tenants/:tenantSlug/role-definitions',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('roles:manage') },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const body = request.body as { name: string, scope: Scope, description?: string }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      if (!(await scopeApplicationValid(app, tenantSlug, body.scope))) {
        return reply.code(400).send({ error: 'scope.application must reference an existing, active application for this tenant' })
      }

      const key = keyFor(tenantSlug, body.name, body.scope)
      // Serialized per key -- `consequent`'s own per-actor queue doesn't
      // cover the `getOrCreate` fetch the `doesNotExist` guard depends on
      // (see `mutex.ts`'s header comment); without this, two concurrent
      // creates for the same name+scope could both pass the guard.
      const results = await roleDefinitionMutex.runExclusive(key, () => app.consequent.handle(key, 'roleDefinition.create', {
        tenant: tenantSlug,
        name: body.name,
        scope: body.scope,
        description: body.description ?? '',
      }))
      const rejection = results.find((r) => r?.rejected)
      if (rejection) {
        return reply.code(409).send({ error: rejection.reason?.message })
      }

      await app.publisher.publish('roleDefinition.created', {
        tenant: tenantSlug, name: body.name, scope: body.scope, status: 'active',
      })

      const created = await fetchRoleDefinition(app, tenantSlug, key)
      return reply.code(201).send(toResponse(created!))
    },
  )

  app.patch(
    '/tenants/:tenantSlug/role-definitions/:id',
    { schema: { params: roleDefParamsSchema, body: patchBodySchema }, preHandler: requirePermission('roles:manage') },
    async (request, reply) => {
      const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
      const body = request.body as { description?: string, status?: 'retired' }

      const current = await fetchRoleDefinition(app, tenantSlug, id)
      if (!current) return reply.code(404).send()

      if (body.description !== undefined) {
        const results = await app.consequent.handle(id, 'roleDefinition.update', { description: body.description })
        const rejection = results.find((r) => r?.rejected)
        if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
      }

      if (body.status === 'retired') {
        const results = await app.consequent.handle(id, 'roleDefinition.retire', {})
        const rejection = results.find((r) => r?.rejected)
        if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

        await app.publisher.publish('roleDefinition.retired', {
          tenant: tenantSlug, name: current.name, scope: current.scope, status: 'retired',
        })
      }

      const updated = await fetchRoleDefinition(app, tenantSlug, id)
      return toResponse(updated!)
    },
  )

  // Soft alias for `PATCH { status: "retired" }` (ADR 0047/0053) -- existing
  // grants of an already-retired role stay intact as historical fact,
  // retiring only blocks future grants.
  app.delete(
    '/tenants/:tenantSlug/role-definitions/:id',
    { schema: { params: roleDefParamsSchema }, preHandler: requirePermission('roles:manage') },
    async (request, reply) => {
      const { tenantSlug, id } = request.params as { tenantSlug: string, id: string }
      const current = await fetchRoleDefinition(app, tenantSlug, id)
      if (!current) return reply.code(404).send()

      if (current.status === 'retired') {
        // Retry converges rather than erroring -- same "retry-same-request
        // is the recovery model" convention `applications.ts`'s own DELETE
        // follows.
        return toResponse(current)
      }

      const results = await app.consequent.handle(id, 'roleDefinition.retire', {})
      const rejection = results.find((r) => r?.rejected)
      if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

      await app.publisher.publish('roleDefinition.retired', {
        tenant: tenantSlug, name: current.name, scope: current.scope, status: 'retired',
      })

      const updated = await fetchRoleDefinition(app, tenantSlug, id)
      return toResponse(updated!)
    },
  )
}

export default roleDefinitionsRoutes
