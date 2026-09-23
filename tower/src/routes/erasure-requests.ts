import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ErasureRequestState } from '../actors/erasure_request_actor.js'
import { EXPECTED_SERVICES } from '../actors/erasure_request_actor.js'
import { requirePermission } from '../lib/permissions.js'

// Per ADR 0026/0075: read-only visibility into an erasure request's
// acknowledgement tracking. `expectedServices` is computed here at read
// time from the fixed constant, never persisted on the actor itself, so
// callers diff against it rather than hardcoding their own copy.
//
// Scope note: the cross-tenant operator `GET /operator/erasure-requests/stuck`
// view (ADR 0075) is deliberately not implemented in this pilot slice --
// see TESTING.md.

const paramsSchema = {
  type: 'object',
  required: ['tenantSlug', 'contactId'],
  properties: { tenantSlug: { type: 'string' }, contactId: { type: 'string' } },
} as const

const erasureRequestsRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/erasure-requests/:contactId',
    { schema: { params: paramsSchema }, preHandler: requirePermission('erasure-requests:read') },
    async (request, reply) => {
      const { contactId } = request.params as { tenantSlug: string, contactId: string }
      const instance = await app.consequent.fetch('erasureRequest', contactId)
      const state = instance?.state as unknown as ErasureRequestState | undefined
      if (!state || !state.requestedAt) return reply.code(404).send()
      return {
        tenant: state.tenant,
        contactId: state.contactId,
        accountId: state.accountId,
        requestedAt: state.requestedAt,
        status: state.status,
        acknowledgedBy: state.acknowledgedBy,
        expectedServices: EXPECTED_SERVICES,
      }
    },
  )
}

export default erasureRequestsRoutes
