import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { requirePermission } from '../lib/auth.js'
import { rateLimitPreHandler } from '../lib/rate-limit.js'

// Per design/stories/chronicle/002-reporting-api.md / ADR 0056. Called only
// by `web` as part of its cross-service GDPR export assembly -- tower
// resolves `identityHashes` for an account first; this route never accepts
// a caller-supplied `contactId`/`accountId` directly, since chronicle has
// no way to resolve either on its own. Same rate-limiting guardrail as
// `/query` -- a list of `identityHashes` is still a query.

const paramsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const bodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['identityHashes'],
  properties: {
    identityHashes: { type: 'array', items: { type: 'string' } },
  },
} as const

const exportSummaryRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/tenants/:tenantSlug/analytics/export-summary', {
    schema: { params: paramsSchema, body: bodySchema },
    preHandler: [
      requirePermission(app.config.internalJwtSecret, 'analytics:read'),
      rateLimitPreHandler(app.rateLimiter),
    ],
  }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { identityHashes } = request.body as { identityHashes: string[] }

    return app.clickhouse.exportSummary({ tenant: tenantSlug, identityHashes })
  })
}

export default exportSummaryRoutes
