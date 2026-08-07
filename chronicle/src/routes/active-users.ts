import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../lib/auth.js'
import { validateDateRange } from '../lib/date-range.js'
import type { Granularity } from '../lib/types.js'

// Per design/stories/chronicle/002-reporting-api.md.
// Omitted `application` dedupes tenant-wide via `identityHash`; a
// specified `application` scopes the same dedup logic to one product. This
// same query (current period only) is what drives `web`'s Overview summary
// tile -- "one mechanism, two renderings," not a separate implementation
// -- so this route is the only place that dedup logic lives.

const paramsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const querystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to', 'granularity'],
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    granularity: { type: 'string', enum: ['day', 'week', 'month'] },
    application: { type: 'string' },
  },
} as const

const activeUsersRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/analytics/reports/active-users', {
    schema: { params: paramsSchema, querystring: querystringSchema },
    preHandler: requirePermission(app.config.internalJwtSecret, 'analytics:read'),
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { from, to, granularity, application } = request.query as {
      from: string
      to: string
      granularity: Granularity
      application?: string
    }

    const rangeError = validateDateRange({ from, to }, app.config.reporting.maxDateRangeDays)
    if (rangeError) {
      return reply.code(400).send({ error: rangeError })
    }

    return app.clickhouse.activeUsers({
      tenant: tenantSlug,
      dateRange: { from, to },
      granularity,
      application,
    })
  })
}

export default activeUsersRoutes
