import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { SuppressionState } from '../actors/suppression_actor.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/herald/004-communication-history-opt-outs-and-suppressions.md.
// Gated by `suppressions:manage` -- every route here, POST included: this
// is the admin/support-initiated "please stop emailing me entirely" action
// (Story 004's own framing, `reason` restricted to "manual" precisely
// because "hard-bounce"/"complaint" are reserved for the SES/SNS webhook
// path), not a public unauthenticated endpoint. Story 006's own route
// table originally (incorrectly) excluded this POST as "the public
// suppression-create endpoint" -- there is no such separate public route
// anywhere in this codebase; fixed in the design repo to match this file's
// own pre-existing comment and Story 004's actual framing.

async function fetchSuppression(app: FastifyInstance, contactId: string): Promise<SuppressionState> {
  const instance = await app.consequent.fetch('suppression', contactId)
  return instance!.state as unknown as SuppressionState
}

function exists(state: SuppressionState): boolean {
  return Boolean(state.createdAt)
}

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const contactParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'contactId'],
  properties: { tenantSlug: { type: 'string' }, contactId: { type: 'string' } },
} as const

const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reason: { type: 'string', enum: ['hard-bounce', 'complaint', 'manual'] },
    since: { type: 'string', format: 'date-time' },
    until: { type: 'string', format: 'date-time' },
  },
} as const

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['contactId'],
  properties: {
    contactId: { type: 'string', minLength: 1 },
    // Deliberately restricted to "manual" -- "hard-bounce"/"complaint" are
    // only ever set by the SES/SNS webhook path (Story 001/005), never by
    // a client-supplied value through this route.
    reason: { type: 'string', enum: ['manual'] },
  },
} as const

const suppressionRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/suppressions', { schema: { params: tenantParamsSchema, querystring: listQuerySchema }, preHandler: requirePermission('suppressions:manage') }, async (request) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const query = request.query as { reason?: string, since?: string, until?: string }

    const criteria: Record<string, unknown> = { tenant: tenantSlug }
    if (query.reason) criteria.reason = query.reason
    // Criteria wrapped in an array -- see the fuller note in
    // `src/lib/template-lookup.ts#templatesFor` for why (`consequent-
    // postgres`'s real search adapter requires it despite the published
    // type).
    const instances = await app.consequent.find('suppression', [criteria] as unknown as Record<string, unknown>)
    let states = instances.map((i) => i.state as unknown as SuppressionState).filter(exists)
    if (query.since) states = states.filter((s) => s.createdAt >= query.since!)
    if (query.until) states = states.filter((s) => s.createdAt <= query.until!)
    return states
  })

  app.post('/tenants/:tenantSlug/suppressions', { schema: { params: tenantParamsSchema, body: createBodySchema }, preHandler: requirePermission('suppressions:manage') }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string }
    const { contactId, reason } = request.body as { contactId: string, reason?: 'manual' }

    const results = await app.consequent.handle(contactId, 'suppression.create', { tenant: tenantSlug, contactId, reason: reason ?? 'manual' })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const state = await fetchSuppression(app, contactId)
    return reply.code(201).send(state)
  })

  // Removes the row outright -- a bounce was transient-but-misclassified,
  // or a complaint was mistaken. Real DELETE, same reasoning as opt-out
  // category removal (Story 004).
  app.delete('/tenants/:tenantSlug/suppressions/:contactId', { schema: { params: contactParamsSchema }, preHandler: requirePermission('suppressions:manage') }, async (request, reply) => {
    const { contactId } = request.params as { tenantSlug: string, contactId: string }

    const current = await fetchSuppression(app, contactId)
    if (!exists(current)) {
      return reply.code(404).send()
    }

    const results = await app.consequent.handle(contactId, 'suppression.remove', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    return reply.code(204).send()
  })
}

export default suppressionRoutes
