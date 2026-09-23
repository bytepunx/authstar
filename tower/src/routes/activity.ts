import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { TenantState } from '../actors/tenant_actor.js'
import { requirePermission } from '../lib/permissions.js'
import { isOperatorRequest } from '../lib/operator-auth.js'
import { buildActivityFeed } from '../lib/activity-feed.js'

// Per design/stories/tower/010-activity-feed.md and design/decisions/
// 0060-activity-feed-and-revenue-summary.md. Tenant-scoped and
// operator-scoped routes share the exact same handler (`handleActivity`)
// -- the only difference is which auth check runs first, per ADR 0030's
// "operator tree wraps the same handler, different auth middleware"
// pattern already established by `rotate-keys.ts` and this repo's other
// operator/tenant route pairs.
//
// `X-Operator-Actor`/`event.actingAs` (the rest of this story's operator-
// scoped checklist) has no route to attach to yet -- every route that
// *writes* an operator-attributed event (grant/revoke, provider changes,
// invite issuance) is Story 013's full operator route tree, explicitly
// "Not Covered Here" in this story. `buildActivityFeed`'s read side
// already surfaces `event.actingAs` when present (falls back to `null`
// per the story's own wording), ready for Story 013's mutating routes to
// populate once they exist -- nothing here needs to change when they
// land.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const activityQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 200 },
    cursor: { type: 'string' },
  },
} as const

interface ActivityQuery {
  limit?: number
  cursor?: string
}

async function fetchTenant(app: FastifyInstance, tenantSlug: string): Promise<TenantState> {
  const instance = await app.consequent.fetch('tenant', tenantSlug)
  return instance!.state as unknown as TenantState
}

function tenantExists(state: TenantState): boolean {
  return Boolean(state.createdAt)
}

async function handleActivity(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const { tenantSlug } = request.params as { tenantSlug: string }
  const { limit, cursor } = request.query as ActivityQuery

  const tenant = await fetchTenant(app, tenantSlug)
  if (!tenantExists(tenant)) return reply.code(404).send()

  const page = await buildActivityFeed(app, tenantSlug, { limit, cursor })
  return reply.code(200).send(page)
}

const activityRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/activity',
    { schema: { params: tenantParamsSchema, querystring: activityQuerySchema }, preHandler: requirePermission('activity:read') },
    async (request, reply) => handleActivity(app, request, reply),
  )

  app.get(
    '/operator/tenants/:tenantSlug/activity',
    { schema: { params: tenantParamsSchema, querystring: activityQuerySchema } },
    async (request, reply) => {
      if (!isOperatorRequest(request.headers, app.provisioningConfig.operatorToken)) {
        return reply.code(403).send({ error: 'operator bearer token required' })
      }
      return handleActivity(app, request, reply)
    },
  )
}

export default activityRoutes
