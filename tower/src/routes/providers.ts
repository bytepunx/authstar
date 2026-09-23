import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { ProviderState } from '../actors/provider_actor.js'
import { requirePermission } from '../lib/permissions.js'
import { createKeyedMutex } from '../lib/mutex.js'
import { searchCriteria } from '../lib/consequent-types.js'
import { requireOperatorAuth, requireOperatorActor, operatorActor } from '../lib/operator-auth.js'

// Per design/stories/tower/004-applications-and-providers.md (Providers
// half -- Applications half already built in routes/applications.ts) and
// ADR 0047/0051/0053/0067/0073/0082.
//
// Same deviation from Story 004's literal route description as
// applications.ts's own header comment already documents, for the same
// reason: `tenant.providers` (`TenantProviderRef`) only ever carries
// `{name}` -- no `status` -- so it can't answer "list active providers" on
// its own. List/detail/patch/delete resolve directly against the
// `provider` actor instead (`consequent.find`/`fetch`); creation still
// goes through `tenant.add-provider` for the same race-free
// duplicate-name reasoning `add-application` already established, *plus* a
// direct `provider.create` (the same dual-write pattern), since
// `tenant.add-provider` alone never creates the child actor.
//
// `clientSecret` is write-only, never stored on the `provider` actor
// (provider_actor.ts's own header comment) -- pushed straight to signet
// under `tenant-<slug>-provider-<name>-client-secret`, the exact naming
// `routes/provisioning.ts`'s own default-provider seeding already
// established. Rotation (PATCH with a new `clientSecret`) is the same
// push, no actor event needed -- the actor never knew the old value either.
//
// Story 013: every handler is registered twice (tenant-scoped and
// `/operator/...`), same pattern as `routes/accounts.ts` -- see that
// file's own header comment for the full reasoning.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const providerParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'name'],
  properties: { tenantSlug: { type: 'string' }, name: { type: 'string' } },
} as const

const listQuerySchema = {
  type: 'object',
  properties: { includeRemoved: { type: 'string', enum: ['true', 'false'] } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'discoveryUrl', 'clientId', 'clientSecret'],
  properties: {
    name: { type: 'string', minLength: 1 },
    discoveryUrl: { type: 'string', minLength: 1 },
    clientId: { type: 'string', minLength: 1 },
    clientSecret: { type: 'string', minLength: 1 },
    scope: { type: 'array', items: { type: 'string' } },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // `name` is deliberately absent -- immutable, it's half of the actor's
    // own key.
    discoveryUrl: { type: 'string', minLength: 1 },
    clientId: { type: 'string', minLength: 1 },
    scope: { type: 'array', items: { type: 'string' } },
    clientSecret: { type: 'string', minLength: 1 },
    status: { type: 'string', enum: ['removed'] },
    // "active" is deliberately absent -- no reactivate command exists on
    // `provider` (matches `application`'s own posture: removal is terminal
    // through this route).
  },
} as const

function providerKeyFor(tenantSlug: string, name: string): string {
  return `${tenantSlug}:${name}`
}

function secretNameFor(tenantSlug: string, name: string): string {
  return `tenant-${tenantSlug}-provider-${name}-client-secret`
}

async function fetchTenant(app: FastifyInstance, tenantSlug: string): Promise<TenantState> {
  const instance = await app.consequent.fetch('tenant', tenantSlug)
  return instance!.state as unknown as TenantState
}

function tenantExists(state: TenantState): boolean {
  return Boolean(state.createdAt)
}

async function fetchProvider(app: FastifyInstance, tenantSlug: string, name: string): Promise<ProviderState | null> {
  const instance = await app.consequent.fetch('provider', providerKeyFor(tenantSlug, name))
  const state = instance?.state as unknown as ProviderState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug) return null
  return state
}

function toResponse(state: ProviderState) {
  return {
    tenant: state.tenant,
    name: state.name,
    clientId: state.clientId,
    discoveryUrl: state.discoveryUrl,
    scope: state.scope,
    discoveryStatus: state.discoveryStatus,
    status: state.status,
    createdAt: state.createdAt,
    // clientSecret is never present -- it was never stored on this actor.
  }
}

// ADR 0051/0067, Story 001: two independent checks before a provider can be
// removed, either one rejects the write.
async function providerInUse(app: FastifyInstance, tenantSlug: string, name: string): Promise<boolean> {
  // Every *visible* (non-_admin) active application under this tenant --
  // any reference at all blocks removal, no "last one" exception.
  const instances = await app.consequent.find('application', searchCriteria({ tenant: tenantSlug, status: 'active' }))
  const inUseByRegularApp = instances
    .map((i) => i.state as unknown as ApplicationState)
    .filter((s) => s.slug !== '_admin')
    .some((s) => s.exposedProviders.includes(name))
  if (inUseByRegularApp) return true

  // `_admin` specifically, bypassing the usual exclusion -- only blocks if
  // removing this provider would leave `_admin` with zero providers
  // (removing tenant-admin login entirely), not merely "in use."
  const adminInstance = await app.consequent.fetch('application', `${tenantSlug}:_admin`)
  const adminState = adminInstance?.state as unknown as ApplicationState | undefined
  if (adminState?.exposedProviders.includes(name) && adminState.exposedProviders.length === 1) {
    return true
  }

  return false
}

// See `src/lib/mutex.ts`'s own header comment for why this exists: closes
// a real concurrent-duplicate-name race `consequent`'s own per-actor queue
// does not, by itself, prevent -- same reasoning `applications.ts`'s own
// `appMutex` documents.
const providerMutex = createKeyedMutex()

async function listProviders(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const { includeRemoved } = request.query as { includeRemoved?: string }

  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()

  const instances = await app.consequent.find('provider', searchCriteria({ tenant: tenantSlug }))
  const states = instances.map((i) => i.state as unknown as ProviderState)
  return states
    .filter((s) => includeRemoved === 'true' || s.status !== 'removed')
    .map(toResponse)
}

async function getProvider(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, name } = request.params as { tenantSlug: string, name: string }
  const state = await fetchProvider(app, tenantSlug, name)
  if (!state) return reply.code(404).send()
  return toResponse(state)
}

async function createProvider(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const body = request.body as { name: string, discoveryUrl: string, clientId: string, clientSecret: string, scope?: string[] }
  const actingAs = operatorActor(request)

  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()

  // Everything from here down runs inside `providerMutex` -- the
  // duplicate-name check is re-read fresh *inside* the lock, not reusing
  // the `tenant` fetched above (same reasoning `applications.ts`'s own
  // POST documents).
  const outcome = await providerMutex.runExclusive(tenantSlug, async () => {
    const current = await fetchTenant(app, tenantSlug)
    if (current.providers.some((p) => p.name === body.name)) {
      return { rejected: true as const, status: 409, error: 'a provider with this name already exists for this tenant' }
    }

    const providerKey = providerKeyFor(tenantSlug, body.name)
    const existing = await app.consequent.fetch('provider', providerKey)
    const existingState = existing?.state as unknown as ProviderState | undefined
    if (!existingState?.createdAt) {
      await app.consequent.handle(providerKey, 'provider.create', {
        tenant: tenantSlug,
        name: body.name,
        clientId: body.clientId,
        discoveryUrl: body.discoveryUrl,
        scope: body.scope ?? [],
        actingAs,
      })
    }

    const results = await app.consequent.handle(tenantSlug, 'tenant.add-provider', { name: body.name })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return { rejected: true as const, status: 409, error: rejection.reason?.message }
    }

    return { rejected: false as const }
  })

  if (outcome.rejected) {
    return reply.code(outcome.status).send({ error: outcome.error })
  }

  await app.signetAdmin.pushSecret('portcullis', secretNameFor(tenantSlug, body.name), body.clientSecret)

  const created = await fetchProvider(app, tenantSlug, body.name)
  return reply.code(201).send(toResponse(created!))
}

async function patchProvider(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, name } = request.params as { tenantSlug: string, name: string }
  const body = request.body as { discoveryUrl?: string, clientId?: string, scope?: string[], clientSecret?: string, status?: 'removed' }

  const current = await fetchProvider(app, tenantSlug, name)
  if (!current) return reply.code(404).send()

  const providerKey = providerKeyFor(tenantSlug, name)
  const actingAs = operatorActor(request)

  if (body.discoveryUrl !== undefined || body.clientId !== undefined || body.scope !== undefined) {
    const results = await app.consequent.handle(providerKey, 'provider.update', {
      discoveryUrl: body.discoveryUrl,
      clientId: body.clientId,
      scope: body.scope,
      actingAs,
    })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
  }

  if (body.clientSecret !== undefined) {
    await app.signetAdmin.pushSecret('portcullis', secretNameFor(tenantSlug, name), body.clientSecret)
  }

  if (body.status === 'removed') {
    if (await providerInUse(app, tenantSlug, name)) {
      return reply.code(409).send({ error: 'provider is still referenced by an application\'s exposedProviders' })
    }
    const results = await app.consequent.handle(providerKey, 'provider.remove', { actingAs })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) return reply.code(409).send({ error: rejection.reason?.message })
  }

  const updated = await fetchProvider(app, tenantSlug, name)
  return toResponse(updated!)
}

// Soft alias for `PATCH { status: "removed" }` (ADR 0053) -- same
// resolve-then-direct-update path as PATCH above.
async function deleteProvider(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug, name } = request.params as { tenantSlug: string, name: string }
  const current = await fetchProvider(app, tenantSlug, name)
  if (!current) return reply.code(404).send()

  if (current.status === 'removed') {
    // Retry converges rather than erroring -- same "retry-same-request is
    // the recovery model" convention every other soft-delete route in this
    // codebase follows.
    return toResponse(current)
  }

  if (await providerInUse(app, tenantSlug, name)) {
    return reply.code(409).send({ error: 'provider is still referenced by an application\'s exposedProviders' })
  }

  const providerKey = providerKeyFor(tenantSlug, name)
  const results = await app.consequent.handle(providerKey, 'provider.remove', { actingAs: operatorActor(request) })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

  const updated = await fetchProvider(app, tenantSlug, name)
  return toResponse(updated!)
}

const providersRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/providers',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema } },
    (request, reply) => listProviders(app, request, reply),
  )

  app.get(
    '/tenants/:tenantSlug/providers/:name',
    { schema: { params: providerParamsSchema } },
    (request, reply) => getProvider(app, request, reply),
  )

  app.post(
    '/tenants/:tenantSlug/providers',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('providers:manage') },
    (request, reply) => createProvider(app, request, reply),
  )

  app.patch(
    '/tenants/:tenantSlug/providers/:name',
    { schema: { params: providerParamsSchema, body: patchBodySchema }, preHandler: requirePermission('providers:manage') },
    (request, reply) => patchProvider(app, request, reply),
  )

  app.delete(
    '/tenants/:tenantSlug/providers/:name',
    { schema: { params: providerParamsSchema }, preHandler: requirePermission('providers:manage') },
    (request, reply) => deleteProvider(app, request, reply),
  )

  // Story 013: the operator tree -- same handlers, bearer-token auth
  // instead of `permissions`, mutations additionally require
  // `X-Operator-Actor`.
  app.get(
    '/operator/tenants/:tenantSlug/providers',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => listProviders(app, request, reply),
  )

  app.get(
    '/operator/tenants/:tenantSlug/providers/:name',
    { schema: { params: providerParamsSchema }, preHandler: requireOperatorAuth(app) },
    (request, reply) => getProvider(app, request, reply),
  )

  app.post(
    '/operator/tenants/:tenantSlug/providers',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => createProvider(app, request, reply),
  )

  app.patch(
    '/operator/tenants/:tenantSlug/providers/:name',
    { schema: { params: providerParamsSchema, body: patchBodySchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => patchProvider(app, request, reply),
  )

  app.delete(
    '/operator/tenants/:tenantSlug/providers/:name',
    { schema: { params: providerParamsSchema }, preHandler: requireOperatorActor(app) },
    (request, reply) => deleteProvider(app, request, reply),
  )
}

export default providersRoutes
