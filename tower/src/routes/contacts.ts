import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { AccountState } from '../actors/account_actor.js'

// Per design/stories/tower/008-contacts-erasure-and-export.md and ADR
// 0026/0040. `contact` lookup is always a direct key computation
// (tenant+email -> deterministic HMAC id), never a browse/list --
// `GET .../contacts?email=` is deliberately single-result-or-404, not a
// search endpoint.
//
// Scope note: this pilot slice does not implement the `contacts:read`/
// `contacts:erase` permission gates themselves (no RBAC middleware exists
// yet in this codebase at all -- Story 005's permission-checking is a
// separate, larger piece of work) -- every route here is reachable by any
// caller that can reach tower's HTTP surface. See TESTING.md.

const tenantParamsSchema = {
  type: 'object',
  required: ['tenantSlug'],
  properties: { tenantSlug: { type: 'string' } },
} as const

const emailQuerySchema = {
  type: 'object',
  required: ['email'],
  properties: { email: { type: 'string', minLength: 3 } },
} as const

const contactParamsSchema = {
  type: 'object',
  required: ['tenantSlug', 'contactId'],
  properties: { tenantSlug: { type: 'string' }, contactId: { type: 'string' } },
} as const

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string', minLength: 1 } },
} as const

const contactsRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get(
    '/tenants/:tenantSlug/contacts',
    { schema: { params: tenantParamsSchema, querystring: emailQuerySchema } },
    async (request, reply) => {
      const { tenantSlug } = request.params as { tenantSlug: string }
      const { email } = request.query as { email: string }
      const contact = await app.contactStore.findByEmail(tenantSlug, email)
      if (!contact) return reply.code(404).send()
      return contact
    },
  )

  app.patch(
    '/tenants/:tenantSlug/contacts/:contactId',
    { schema: { params: contactParamsSchema, body: patchBodySchema } },
    async (request, reply) => {
      const { contactId } = request.params as { tenantSlug: string, contactId: string }
      const body = request.body as { name: string }
      const updated = await app.contactStore.updateName(contactId, body.name)
      if (!updated) return reply.code(404).send()
      return updated
    },
  )

  // Erasure trigger (ADR 0026): real Postgres DELETE of the contact row,
  // creates an `erasureRequest` actor to track downstream acknowledgements,
  // and publishes `contact.purged` for the fixed fan-out (herald, keep,
  // ...). `account`/`identity` are deliberately untouched -- `contactId`
  // becomes a dangling pointer on `account`, the account keeps functioning.
  app.delete(
    '/tenants/:tenantSlug/contacts/:contactId',
    { schema: { params: contactParamsSchema } },
    async (request, reply) => {
      const { tenantSlug, contactId } = request.params as { tenantSlug: string, contactId: string }
      const contact = await app.contactStore.findById(contactId)
      if (!contact) return reply.code(404).send()

      const accounts = await app.consequent.find('account', { tenant: tenantSlug, contactId })
      const accountId = ((accounts[0]?.state as unknown as AccountState | undefined)?.accountId) ?? null

      await app.contactStore.remove(contactId)
      await app.consequent.handle(contactId, 'erasureRequest.create', {
        tenant: tenantSlug,
        contactId,
        accountId,
      })
      await app.publisher.publish('contact.purged', { tenant: tenantSlug, contactId, accountId })

      return reply.code(202).send({ contactId, status: 'pending' })
    },
  )
}

export default contactsRoutes
