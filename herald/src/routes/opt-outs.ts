import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { OptOutState } from '../actors/opt_out_actor.js'

// Per design/stories/herald/004-communication-history-opt-outs-and-suppressions.md.

async function fetchOptOut(app: FastifyInstance, contactId: string): Promise<OptOutState> {
  const instance = await app.consequent.fetch('optOut', contactId)
  return instance!.state as unknown as OptOutState
}

const contactParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'contactId'],
  properties: { tenantSlug: { type: 'string' }, contactId: { type: 'string' } },
} as const

const categoryParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'contactId', 'category'],
  properties: { tenantSlug: { type: 'string' }, contactId: { type: 'string' }, category: { type: 'string' } },
} as const

const categoryBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['category'],
  properties: { category: { type: 'string', minLength: 1 } },
} as const

const optOutRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/tenants/:tenantSlug/opt-outs/:contactId', { schema: { params: contactParamsSchema } }, async (request) => {
    const { contactId } = request.params as { tenantSlug: string, contactId: string }
    const state = await fetchOptOut(app, contactId)
    // Never created -- a contact with no opt-outs at all is a normal,
    // common case, not a 404 -- returns an empty list rather than an error.
    return { contactId, optedOutCategories: state.optedOutCategories }
  })

  // The admin/support-side entry point ("a recipient called and asked to
  // be removed") -- the self-service path is the public /unsubscribe flow,
  // not this route (Story 002/004).
  app.post('/tenants/:tenantSlug/opt-outs/:contactId/categories', { schema: { params: contactParamsSchema, body: categoryBodySchema } }, async (request, reply) => {
    const { tenantSlug, contactId } = request.params as { tenantSlug: string, contactId: string }
    const { category } = request.body as { category: string }

    const results = await app.consequent.handle(contactId, 'optOut.addCategory', { tenant: tenantSlug, contactId, category })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const state = await fetchOptOut(app, contactId)
    return reply.code(200).send({ contactId, optedOutCategories: state.optedOutCategories })
  })

  // A real DELETE, not a soft alias -- collection-membership removal, not
  // a lifecycle status change (ADR 0053, Story 004).
  app.delete('/tenants/:tenantSlug/opt-outs/:contactId/categories/:category', { schema: { params: categoryParamsSchema } }, async (request, reply) => {
    const { contactId, category } = request.params as { tenantSlug: string, contactId: string, category: string }

    const current = await fetchOptOut(app, contactId)
    if (!current.tenant) {
      return reply.code(404).send()
    }

    const results = await app.consequent.handle(contactId, 'optOut.removeCategory', { category })
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      return reply.code(409).send({ error: rejection.reason?.message })
    }

    const state = await fetchOptOut(app, contactId)
    return { contactId, optedOutCategories: state.optedOutCategories }
  })
}

export default optOutRoutes
