import type { RoleReferenceCache } from './role-reference-cache.js'

// Per ADR 0047: "A narrow, one-time (and periodically re-run as a safety
// net) backfill from tower at keep's own startup seeds this cache -- the
// one deliberate, narrowly-scoped exception to 'keep never calls tower
// directly.'" This module is that backfill.
//
// **Deliberate deviation from the ADR's literal "at keep's own startup,
// across everything" framing, worth being explicit about**: tower has no
// `GET /tenants` (or any other) endpoint that lists every tenant on the
// installation -- only per-tenant lookups (`GET /tenants/{slug}`) and
// per-tenant application/role-definition lists exist (tower's own Story
// 013 operator route tree, which might have grown a cross-tenant list
// route, is still unbuilt -- see tower's own TESTING.md). A single eager
// sweep "across everything" at boot is therefore not buildable against
// tower's actual current API surface without inventing new tower-side
// scope this task never set out to add.
//
// The real, buildable equivalent implemented here: **per-tenant, on
// first-touch**. `ensureFresh(tenant)` backfills a tenant the first time
// keep is asked to validate `grantedRoles` for it in this process's
// lifetime (called from `plan-mappings.ts`/`trials.ts`/`coupons.ts` right
// before validation), and is a no-op for any tenant already backfilled.
// This is a deliberate, narrow exception to `ensureFresh`'s own caller
// otherwise never blocking on an external call mid-write -- but it's the
// same order-of-magnitude latency cost those routes already pay for the
// Stripe price lookup later in the same request, and it only ever happens
// once per tenant per keep process lifetime, not on every write. After
// that first backfill, the live `role-reference-consumer.ts` RabbitMQ
// consumer keeps the cache current, and `refreshAll()` (wired into
// `server.ts` on an interval) is the ADR's own "periodic re-run as a
// safety net" for every tenant already known, guarding against a missed
// RabbitMQ delivery rather than against staleness from never having
// backfilled at all.
//
// A failed backfill attempt (tower unreachable, non-2xx, malformed body)
// is swallowed here, not thrown to the caller -- `ensureFresh` never marks
// a tenant backfilled on failure, so the *next* call for that tenant
// retries automatically, and in the meantime `grantedRoles` validation
// against an empty/stale cache fails closed (rejects), the same safe
// default this cache already had before any of this existed
// (`createRoleReferenceCache({})`, previously the *only* state it ever
// had).

export interface TowerApplicationSummary {
  slug: string
  status: string
}

export interface TowerRoleDefinitionSummary {
  name: string
  scope: 'tenant' | { application: string }
  status: string
}

export interface TowerReferenceClient {
  listApplications(tenant: string): Promise<TowerApplicationSummary[]>
  listRoleDefinitions(tenant: string): Promise<TowerRoleDefinitionSummary[]>
}

// Real, `fetch`-based implementation -- tower's `GET /tenants/{tenantSlug}/
// applications`/`GET /tenants/{tenantSlug}/role-definitions` routes are
// unauthenticated in this pilot slice (no `requirePermission` preHandler,
// matching every other GET route in tower's own current route table), so
// no auth header is sent; see tower's own TESTING.md for the tracked
// mTLS/SPIFFE-at-the-fastify-layer gap this inherits until that's closed.
export function createTowerReferenceClient(baseUrl: string): TowerReferenceClient {
  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`)
    if (!response.ok) {
      throw new Error(`tower returned ${response.status} for ${path}`)
    }
    return response.json() as Promise<T>
  }

  return {
    listApplications: (tenant) => getJson(`/tenants/${encodeURIComponent(tenant)}/applications`),
    listRoleDefinitions: (tenant) => getJson(`/tenants/${encodeURIComponent(tenant)}/role-definitions`),
  }
}

export interface RoleReferenceBackfill {
  ensureFresh(tenant: string): Promise<void>
  refreshAll(): Promise<void>
}

async function backfillTenant(cache: RoleReferenceCache, tower: TowerReferenceClient, tenant: string): Promise<void> {
  const [applications, roleDefinitions] = await Promise.all([
    tower.listApplications(tenant),
    tower.listRoleDefinitions(tenant),
  ])
  for (const application of applications) {
    cache.upsertApplication(tenant, application.slug, application.status === 'active')
  }
  for (const roleDefinition of roleDefinitions) {
    if (roleDefinition.scope === 'tenant') continue // not tracked, see role-reference-cache.ts
    cache.upsertRoleDefinition(tenant, roleDefinition.scope.application, roleDefinition.name, roleDefinition.status === 'active')
  }
}

export function createRoleReferenceBackfill(cache: RoleReferenceCache, tower: TowerReferenceClient): RoleReferenceBackfill {
  const backfilled = new Set<string>()

  async function ensureFresh(tenant: string): Promise<void> {
    if (backfilled.has(tenant)) return
    await backfillTenant(cache, tower, tenant)
    backfilled.add(tenant) // only reached on success -- a thrown error above leaves the tenant retryable
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([...backfilled].map((tenant) => backfillTenant(cache, tower, tenant)))
  }

  return { ensureFresh, refreshAll }
}

// No-op default -- `buildApp()` falls back to this when no real backfill is
// injected (every existing behavior/integration test pre-seeds the cache
// directly and has no tower to poll), matching the same "existing test
// wiring keeps working unchanged" posture `buildApp.ts`'s other optional
// dependencies already follow.
export function createNoopRoleReferenceBackfill(): RoleReferenceBackfill {
  return {
    async ensureFresh() {},
    async refreshAll() {},
  }
}
