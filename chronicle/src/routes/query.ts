import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../lib/auth.js'
import { rateLimitPreHandler } from '../lib/rate-limit.js'
import { validateDateRange } from '../lib/date-range.js'
import { ALLOWED_GROUP_BY, ALLOWED_METRICS, type GroupByDimension, type MetricName } from '../lib/types.js'

// Per design/stories/chronicle/002-reporting-api.md -- the constrained
// metrics-query endpoint. `groupBy`/`filters` are drawn from an allowed
// vocabulary (ADR 0036); a typo'd value fails loudly (400 via the AJV
// `enum`/`additionalProperties: false` below), never silently ignored or
// treated as ungrouped.

const paramsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const bodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['metric', 'groupBy', 'dateRange'],
  properties: {
    metric: { type: 'string', enum: ALLOWED_METRICS },
    eventType: {
      anyOf: [
        { type: 'string' },
        { type: 'array', items: { type: 'string' } },
      ],
    },
    groupBy: {
      type: 'array',
      items: { type: 'string', enum: ALLOWED_GROUP_BY },
    },
    filters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        application: { type: 'string' },
        status: { type: 'integer' },
        method: { type: 'string' },
      },
    },
    dateRange: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'to'],
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
      },
    },
  },
} as const

interface QueryBody {
  metric: MetricName
  eventType?: string | string[]
  groupBy: GroupByDimension[]
  filters?: { application?: string; status?: number; method?: string }
  dateRange: { from: string; to: string }
}

const queryRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/analytics/query', {
    schema: { params: paramsSchema, body: bodySchema },
    preHandler: [
      requirePermission(app.config.internalJwtSecret, 'analytics:read'),
      rateLimitPreHandler(app.rateLimiter),
    ],
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const body = request.body as QueryBody

    const rangeError = validateDateRange(body.dateRange, app.config.reporting.maxDateRangeDays)
    if (rangeError) {
      return reply.code(400).send({ error: rangeError })
    }

    return app.clickhouse.metricsQuery({
      tenant: tenantSlug,
      metric: body.metric,
      eventType: body.eventType,
      groupBy: body.groupBy,
      filters: body.filters,
      dateRange: body.dateRange,
    })
  })
}

export default queryRoutes
