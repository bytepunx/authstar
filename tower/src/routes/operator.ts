import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import { EXPECTED_SERVICES, type ErasureRequestState } from '../actors/erasure_request_actor.js'
import { searchCriteria } from '../lib/consequent-types.js'
import { requireOperatorAuth } from '../lib/operator-auth.js'

// Per design/stories/tower/013-operator-api.md's "Genuinely new routes"
// section -- the two capabilities that structurally cannot exist on the
// tenant-scoped tree (a tenant-scoped caller already knows its own slug;
// a tenant-scoped erasure-requests list can only ever show one tenant's
// own stuck requests), unlike every other operator route in this repo,
// which reuses a tenant-scoped handler wholesale (see routes/accounts.ts,
// routes/providers.ts, routes/invites.ts).

const DEFAULT_TENANTS_LIMIT = 50
const TENANT_STATUSES: TenantState['status'][] = ['active', 'suspended', 'deleted']

const listTenantsQuerySchema = {
  type: 'object',
  properties: {
    q: { type: 'string' },
    status: { type: 'string', enum: ['active', 'suspended', 'deleted'] },
    limit: { type: 'integer', minimum: 1, maximum: 200 },
    cursor: { type: 'string' },
  },
} as const

const stuckQuerySchema = {
  type: 'object',
  properties: { olderThanHours: { type: 'number', minimum: 0 } },
} as const

function tenantResponse(state: TenantState) {
  // `domain` (ADR 0091) included alongside the rest -- steward's tenant
  // list/detail views need it to link an operator straight to
  // authstar.<domain>, not just identify the tenant.
  return { slug: state.slug, name: state.name, domain: state.domain, status: state.status, createdAt: state.createdAt }
}

// `tenant_actor.ts`'s own `searchableBy: ['status']` has no field that's
// always-present/constant to search "everything" by in one call (an empty
// criteria set matches *nothing*, not everything -- confirmed directly
// against both the in-memory and real Postgres search adapters, not
// assumed) -- so "list every tenant" is three `find()` calls (one per
// status) merged, not one unfiltered query. `q` (slug/name substring) is
// filtered in memory rather than via the search adapter's own `contains`
// operator, since that operator's real semantics diverge between adapters
// (array-membership on the in-memory adapter this repo's own tests use vs.
// a real ILIKE substring match on consequent-postgres) -- filtering here
// keeps behavior identical across both tiers, the same trade-off
// `lib/activity-feed.ts`'s own pagination already documents.
async function listTenants(app: FastifyInstance, statuses: TenantState['status'][]): Promise<TenantState[]> {
  const resultSets = await Promise.all(statuses.map((status) => app.consequent.find('tenant', searchCriteria({ status }))))
  return resultSets.flat().map((i) => i.state as unknown as TenantState)
}

const operatorRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/operator/tenants',
    { schema: { querystring: listTenantsQuerySchema }, preHandler: requireOperatorAuth(app) },
    async (request) => {
      const { q, status, limit, cursor } = request.query as { q?: string, status?: TenantState['status'], limit?: number, cursor?: string }

      const statuses = status ? [status] : TENANT_STATUSES
      const all = await listTenants(app, statuses)
      const needle = q?.toLowerCase()
      const filtered = needle
        ? all.filter((t) => t.slug.toLowerCase().includes(needle) || t.name.toLowerCase().includes(needle))
        : all
      filtered.sort((a, b) => a.slug.localeCompare(b.slug))

      const pageSize = limit && limit > 0 ? limit : DEFAULT_TENANTS_LIMIT
      const startIndex = cursor ? filtered.findIndex((t) => t.slug === cursor) + 1 : 0
      const page = filtered.slice(startIndex, startIndex + pageSize)
      const hasMore = startIndex + pageSize < filtered.length

      return {
        data: page.map(tenantResponse),
        nextCursor: hasMore ? page[page.length - 1]?.slug ?? null : null,
      }
    },
  )

  app.get(
    '/operator/erasure-requests/stuck',
    { schema: { querystring: stuckQuerySchema }, preHandler: requireOperatorAuth(app) },
    async (request) => {
      const { olderThanHours } = request.query as { olderThanHours?: number }
      const thresholdHours = olderThanHours ?? 72
      const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString()

      // No timeout ever exists on this actor by design (ADR 0075) --
      // staleness is entirely this read-time computation, never a write.
      const instances = await app.consequent.find('erasureRequest', searchCriteria({ status: 'pending' }))
      const stuck = instances
        .map((i) => i.state as unknown as ErasureRequestState)
        .filter((r) => r.requestedAt < threshold)
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))

      return stuck.map((r) => ({
        tenant: r.tenant,
        contactId: r.contactId,
        requestedAt: r.requestedAt,
        outstandingServices: EXPECTED_SERVICES.filter((s) => !r.acknowledgedBy.includes(s)),
      }))
    },
  )
}

export default operatorRoutes
