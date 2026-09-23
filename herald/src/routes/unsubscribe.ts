import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { verifyToken } from '../lib/unsubscribe-token.js'

// Per design/stories/herald/001-actor-definitions.md ("Unsubscribe Token").
// `GET` shows a confirmation page only, no side effect -- protects against
// email-security scanners silently prefetching links and unsubscribing real
// recipients who never clicked anything. `POST` performs the actual,
// one-shot-idempotent action.

const tokenQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token'],
  properties: { token: { type: 'string' } },
} as const

const tokenBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['token'],
  properties: { token: { type: 'string' } },
} as const

const unsubscribeRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/unsubscribe', { schema: { querystring: tokenQuerySchema } }, async (request, reply) => {
    const { token } = request.query as { token: string }
    const claims = verifyToken(app.unsubscribeKeyring, token)
    if (!claims) {
      return reply.code(400).send({ error: 'invalid or expired unsubscribe token' })
    }
    // Confirmation only -- no `optOut` mutation happens here.
    return { tenant: claims.tenant, category: claims.category, confirmed: false }
  })

  app.post('/unsubscribe', { schema: { body: tokenBodySchema } }, async (request, reply) => {
    const { token } = request.body as { token: string }
    const claims = verifyToken(app.unsubscribeKeyring, token)
    if (!claims) {
      return reply.code(400).send({ error: 'invalid or expired unsubscribe token' })
    }

    const results = await app.consequent.handle(claims.contactId, 'optOut.addCategory', {
      tenant: claims.tenant,
      contactId: claims.contactId,
      category: claims.category,
    })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    return { tenant: claims.tenant, category: claims.category, confirmed: true }
  })
}

export default unsubscribeRoutes
