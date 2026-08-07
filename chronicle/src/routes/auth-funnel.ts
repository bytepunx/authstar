import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../lib/auth.js'
import { validateDateRange } from '../lib/date-range.js'

// Per design/stories/chronicle/002-reporting-api.md.
// `tenant` is never a caller-supplied filter -- always taken from the URL,
// never from the querystring or body.

const paramsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const querystringSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['from', 'to'],
  properties: {
    from: { type: 'string' },
    to: { type: 'string' },
    application: { type: 'string' },
  },
} as const

const authFunnelRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/analytics/reports/auth-funnel', {
    schema: { params: paramsSchema, querystring: querystringSchema },
    preHandler: requirePermission(app.config.internalJwtSecret, 'analytics:read'),
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { from, to, application } = request.query as { from: string; to: string; application?: string }

    const rangeError = validateDateRange({ from, to }, app.config.reporting.maxDateRangeDays)
    if (rangeError) {
      return reply.code(400).send({ error: rangeError })
    }

    return app.clickhouse.authFunnel({
      tenant: tenantSlug,
      dateRange: { from, to },
      application,
    })
  })
}

export default authFunnelRoutes
