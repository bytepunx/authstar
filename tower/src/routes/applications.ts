import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import type { ApplicationState } from '../actors/application_actor.js'
import type { ProviderState } from '../actors/provider_actor.js'
import { requirePermission } from '../lib/permissions.js'
import { createKeyedMutex } from '../lib/mutex.js'
import { searchCriteria } from '../lib/consequent-types.js'

// Per design/stories/tower/004-applications-and-providers.md (Applications
// half only -- Providers CRUD is a separate, ADR-0047-unrelated surface,
// not built in this pass, see TESTING.md) and ADR 0047/0051/0067/0082.
//
// Two deliberate deviations from Story 004's literal route description,
// both driven by this codebase's actual `application`/`tenant` actor shapes
// (confirmed directly, not assumed) rather than the story's originally
// envisioned `aggregateFrom`-synced embedded array (see tenant_actor.ts's
// own header comment on why `aggregateFrom` isn't actually used here):
//  - List/detail/patch/delete resolve directly against the `application`
//    actor (`consequent.find`/`fetch`), not via `tenant.applications`. That
//    embedded array only ever carries `{slug, name}` (`TenantApplicationRef`
//    in tenant_actor.ts) -- no `status`, so it can't actually answer "list
//    active applications" on its own. `application`'s own
//    `searchableBy: ['tenant', 'status']` plus `identifiedBy: 'key'`
//    (`${tenant}:${slug}`, computable directly from the route params) make
//    a direct actor read strictly more correct here, not merely simpler.
//  - Creation still goes through `tenant.add-application` (Story 004's own
//    requirement, and the one place this route needs `tenant`'s
//    single-writer queue for the race-free duplicate-slug check) *plus* a
//    direct `application.create` -- the same dual-write `routes/
//    provisioning.ts` already established, since `tenant.add-application`
//    alone never creates the child actor. No cross-actor transaction
//    primitive exists (consequent has none) -- a request that loses a true
//    concurrent-create race after already writing `application.create`
//    leaves an orphaned actor at that key; accepted as the same class of
//    risk `provisioning.ts`'s own multi-step sequence already carries
//    (ADR 0067: "retry-same-request is the recovery model"), not newly
//    introduced here.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const appParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'appSlug'],
  properties: { tenantSlug: { type: 'string' }, appSlug: { type: 'string' } },
} as const

const listQuerySchema = {
  type: 'object',
  properties: { includeDeleted: { type: 'string', enum: ['true', 'false'] } },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'name'],
  properties: {
    slug: { type: 'string', minLength: 1, maxLength: 63 },
    name: { type: 'string', minLength: 1 },
    hosts: { type: 'array', items: { type: 'string' } },
    publicUrl: { type: 'string' },
    exposedProviders: { type: 'array', items: { type: 'string' } },
  },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // `slug` is deliberately absent -- immutable, embedded in the actor's
    // own key (ADR 0020).
    name: { type: 'string', minLength: 1 },
    hosts: { type: 'array', items: { type: 'string' } },
    publicUrl: { type: 'string' },
    exposedProviders: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['suspended'] },
    // "active" and "deleted" are deliberately absent from the enum --
    // reactivation is unreachable through this route (no reactivate
    // command exists on `application`, matching `tenant`'s own posture),
    // and "deleted" only comes from the DELETE alias below.
  },
} as const

const SLUG_PATTERN = /^[a-z0-9-]+$/

function appKeyFor(tenantSlug: string, appSlug: string): string {
  return `${tenantSlug}:${appSlug}`
}

async function fetchTenant(app: FastifyInstance, tenantSlug: string): Promise<TenantState> {
  const instance = await app.consequent.fetch('tenant', tenantSlug)
  return instance!.state as unknown as TenantState
}

function tenantExists(state: TenantState): boolean {
  return Boolean(state.createdAt)
}

async function fetchApplication(app: FastifyInstance, tenantSlug: string, appSlug: string): Promise<ApplicationState | null> {
  const instance = await app.consequent.fetch('application', appKeyFor(tenantSlug, appSlug))
  const state = instance?.state as unknown as ApplicationState | undefined
  if (!state?.createdAt || state.tenant !== tenantSlug) return null
  return state
}

function toResponse(state: ApplicationState) {
  return {
    tenant: state.tenant,
    slug: state.slug,
    name: state.name,
    hosts: state.hosts,
    publicUrl: state.publicUrl,
    exposedProviders: state.exposedProviders,
    status: state.status,
    createdAt: state.createdAt,
  }
}

// ADR 0051's correction: `publicUrl`'s host must be present in `hosts`, on
// every write that touches either field -- the server-side backstop for a
// direct API caller bypassing web's UI-level primary-host derivation.
function publicUrlHostValid(hosts: string[], publicUrl: string | undefined): boolean {
  if (!publicUrl) return true
  let host: string
  try {
    host = new URL(publicUrl).host
  } catch {
    return false
  }
  return hosts.includes(host)
}

// Story 004: `exposedProviders` entries must already exist as *active*
// `provider` keys under this tenant -- a reference to an unknown or
// removed provider is rejected, not silently accepted.
async function exposedProvidersValid(app: FastifyInstance, tenantSlug: string, exposedProviders: string[] | undefined): Promise<boolean> {
  if (!exposedProviders || exposedProviders.length === 0) return true
  for (const name of exposedProviders) {
    const instance = await app.consequent.fetch('provider', `${tenantSlug}:${name}`)
    const state = instance?.state as unknown as ProviderState | undefined
    if (!state?.createdAt || state.status !== 'active') return false
  }
  return true
}

// See `src/lib/mutex.ts`'s own header comment for why this exists: closes
// a real concurrent-duplicate-slug race `consequent`'s own per-actor queue
// does not, by itself, prevent.
const appMutex = createKeyedMutex()

const applicationsRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  // Per ADR 0051's screen design: `_admin` is excluded from this list
  // entirely, not just filtered -- it's system-managed, exposing it here
  // invites an admin to "fix" something that breaks their own access to
  // fix it. Not gated by any permission in Story 004's own text (matching
  // `tenants.ts`'s own GET, which is likewise ungated).
  app.get(
    '/tenants/:tenantSlug/applications',
    { schema: { params: tenantParamsSchema, querystring: listQuerySchema } },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const { includeDeleted } = request.query as { includeDeleted?: string }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      const instances = await app.consequent.find('application', searchCriteria({ tenant: tenantSlug }))
      const states = instances.map((i) => i.state as unknown as ApplicationState)
      return states
        .filter((s) => s.slug !== '_admin')
        .filter((s) => includeDeleted === 'true' || s.status !== 'deleted')
        .map(toResponse)
    },
  )

  app.get(
    '/tenants/:tenantSlug/applications/:appSlug',
    { schema: { params: appParamsSchema } },
    async (request, reply) => {
      const { tenantSlug, appSlug } = request.params as { tenantSlug: string, appSlug: string }
      const state = await fetchApplication(app, tenantSlug, appSlug)
      // Cross-tenant/nonexistent/`_admin` all collapse to 404 (ADR 0030's
      // cross-tenant-is-404 rule; `_admin` is invisible to this route the
      // same way it's excluded from the list).
      if (!state || state.slug === '_admin') return reply.code(404).send()
      return toResponse(state)
    },
  )

  app.post(
    '/tenants/:tenantSlug/applications',
    { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('applications:manage') },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const body = request.body as { slug: string, name: string, hosts?: string[], publicUrl?: string, exposedProviders?: string[] }

      const tenant = await fetchTenant(app, tenantSlug)
      if (!tenantExists(tenant)) return reply.code(404).send()

      if (!SLUG_PATTERN.test(body.slug)) {
        return reply.code(400).send({ error: 'slug must match ^[a-z0-9-]+$' })
      }
      // `_admin` is auto-provisioned exactly once, at tenant creation (ADR
      // 0067) -- never through this route, by anyone, at any time.
      if (body.slug === '_admin') {
        return reply.code(400).send({ error: '"_admin" is a reserved slug' })
      }

      const hosts = body.hosts ?? []
      if (!publicUrlHostValid(hosts, body.publicUrl)) {
        return reply.code(400).send({ error: 'publicUrl host must be present in hosts' })
      }
      if (!(await exposedProvidersValid(app, tenantSlug, body.exposedProviders))) {
        return reply.code(400).send({ error: 'exposedProviders must reference existing, active providers for this tenant' })
      }

      // Everything from here down runs inside `appMutex` -- the
      // duplicate-slug check is re-read fresh *inside* the lock (not
      // reusing the `tenant` fetched above, which may already be stale by
      // the time this request's turn comes up) since `consequent`'s own
      // per-actor queue doesn't serialize the fetch step that check
      // depends on (see `mutex.ts`'s header comment).
      const outcome = await appMutex.runExclusive(tenantSlug, async () => {
        const current = await fetchTenant(app, tenantSlug)
        if (current.applications.some((a) => a.slug === body.slug)) {
          return { rejected: true as const, status: 409, error: 'an application with this slug already exists for this tenant' }
        }

        const appKey = appKeyFor(tenantSlug, body.slug)
        const existingApp = await app.consequent.fetch('application', appKey)
        const existingAppState = existingApp?.state as unknown as ApplicationState | undefined
        if (!existingAppState?.createdAt) {
          await app.consequent.handle(appKey, 'application.create', {
            tenant: tenantSlug,
            slug: body.slug,
            name: body.name,
            hosts,
            publicUrl: body.publicUrl ?? '',
            exposedProviders: body.exposedProviders ?? [],
          })
        }

        const results = await app.consequent.handle(tenantSlug, 'tenant.add-application', { slug: body.slug, name: body.name })
        const rejection = results.find((r) => r?.rejected)
        if (rejection) {
          return { rejected: true as const, status: 409, error: rejection.reason?.message }
        }

        return { rejected: false as const }
      })

      if (outcome.rejected) {
        return reply.code(outcome.status).send({ error: outcome.error })
      }

      await app.publisher.publish('application.created', {
        tenant: tenantSlug, application: body.slug, name: body.name, status: 'active',
      })

      const created = await fetchApplication(app, tenantSlug, body.slug)
      return reply.code(201).send(toResponse(created!))
    },
  )

  app.patch(
    '/tenants/:tenantSlug/applications/:appSlug',
    { schema: { params: appParamsSchema, body: patchBodySchema }, preHandler: requirePermission('applications:manage') },
    async (request, reply) => {
      const { tenantSlug, appSlug } = request.params as { tenantSlug: string, appSlug: string }
      const body = request.body as { name?: string, hosts?: string[], publicUrl?: string, exposedProviders?: string[], status?: 'suspended' }

      const current = await fetchApplication(app, tenantSlug, appSlug)
      if (!current || current.slug === '_admin') return reply.code(404).send()

      if (body.hosts !== undefined || body.publicUrl !== undefined) {
        const nextHosts = body.hosts ?? current.hosts
        const nextPublicUrl = body.publicUrl ?? current.publicUrl
        if (!publicUrlHostValid(nextHosts, nextPublicUrl)) {
          return reply.code(400).send({ error: 'publicUrl host must be present in hosts' })
        }
      }
      if (!(await exposedProvidersValid(app, tenantSlug, body.exposedProviders))) {
        return reply.code(400).send({ error: 'exposedProviders must reference existing, active providers for this tenant' })
      }

      const appKey = appKeyFor(tenantSlug, appSlug)

      if (body.name !== undefined || body.hosts !== undefined || body.publicUrl !== undefined || body.exposedProviders !== undefined) {
        const results = await app.consequent.handle(appKey, 'application.update', {
          name: body.name,
          hosts: body.hosts,
          publicUrl: body.publicUrl,
          exposedProviders: body.exposedProviders,
        })
        const rejection = results.find((r) => r?.rejected)
        if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

        // ADR 0047's outbound event, fired specifically for a `hosts` write
        // (as opposed to name/publicUrl/exposedProviders alone) -- keep's
        // reference cache only cares whether an application slug exists
        // and is active, but the event family itself is `hosts-changed`
        // per the story's own naming, so field presence (not a value diff)
        // is what triggers it, matching this route's other publish sites.
        if (body.hosts !== undefined) {
          await app.publisher.publish('application.hosts-changed', {
            tenant: tenantSlug, application: appSlug, name: body.name ?? current.name, status: current.status,
          })
        }
      }

      if (body.status === 'suspended') {
        const results = await app.consequent.handle(appKey, 'application.suspend', {})
        const rejection = results.find((r) => r?.rejected)
        if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

        await app.publisher.publish('application.suspended', {
          tenant: tenantSlug, application: appSlug, name: body.name ?? current.name, status: 'suspended',
        })
      }

      const updated = await fetchApplication(app, tenantSlug, appSlug)
      return toResponse(updated!)
    },
  )

  // Soft alias for `PATCH { status: "deleted" }` (ADR 0051) -- not a row
  // removal, same resolve-then-direct-update path as PATCH above.
  app.delete(
    '/tenants/:tenantSlug/applications/:appSlug',
    { schema: { params: appParamsSchema }, preHandler: requirePermission('applications:manage') },
    async (request, reply) => {
      const { tenantSlug, appSlug } = request.params as { tenantSlug: string, appSlug: string }
      const current = await fetchApplication(app, tenantSlug, appSlug)
      if (!current || current.slug === '_admin') return reply.code(404).send()

      if (current.status === 'deleted') {
        // Retry converges rather than erroring -- same "retry-same-request
        // is the recovery model" convention `accounts.ts`'s no-op
        // change-email path follows.
        return toResponse(current)
      }

      const appKey = appKeyFor(tenantSlug, appSlug)
      const results = await app.consequent.handle(appKey, 'application.delete', {})
      const rejection = results.find((r) => r?.rejected)
      if (rejection) return reply.code(409).send({ error: rejection.reason?.message })

      await app.publisher.publish('application.deleted', {
        tenant: tenantSlug, application: appSlug, name: current.name, status: 'deleted',
      })

      const updated = await fetchApplication(app, tenantSlug, appSlug)
      return toResponse(updated!)
    },
  )
}

export default applicationsRoutes
