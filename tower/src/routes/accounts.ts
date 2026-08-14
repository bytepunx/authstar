import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { AccountState } from '../actors/account_actor.js'
import { requirePermission } from '../lib/permissions.js'

// Per design/stories/tower/005-accounts-roles-and-permissions.md and ADR
// 0076. `POST`, not `PATCH` -- ADR 0076's own reasoning: this repoints
// `account.contactId` to a *different* contact resource (a new or reused
// `contactId`), it isn't a field-level edit of the existing one, so
// modeling it as `PATCH /contacts/{contactId}` would be actively
// misleading about which resource is even being addressed. Gated by
// `accounts:manage` (ADR 0051) -- no new grant, another account-lifecycle
// admin action.

const paramsSchema = {
  type: 'object',
  required: ['tenantSlug', 'accountId'],
  properties: { tenantSlug: { type: 'string' }, accountId: { type: 'string' } },
} as const

const changeEmailBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['newEmail'],
  properties: { newEmail: { type: 'string', minLength: 3 } },
} as const

async function fetchAccount(app: FastifyInstance, accountId: string): Promise<AccountState> {
  const instance = await app.consequent.fetch('account', accountId)
  return instance!.state as unknown as AccountState
}

function exists(state: AccountState): boolean {
  return Boolean(state.createdAt)
}

const accountRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post(
    '/tenants/:tenantSlug/accounts/:accountId/change-email',
    { schema: { params: paramsSchema, body: changeEmailBodySchema }, preHandler: requirePermission('accounts:manage') },
    async (request, reply) => {
      const { tenantSlug, accountId } = request.params as { tenantSlug: string, accountId: string }
      const { newEmail } = request.body as { newEmail: string }

      const current = await fetchAccount(app, accountId)
      if (!exists(current) || current.tenant !== tenantSlug) {
        return reply.code(404).send()
      }

      const oldContactId = current.contactId

      // Find-or-create the contact record for the new email's hash --
      // ADR 0023's existing deterministic-lookup mechanism, the same one
      // invite acceptance already relies on ("inviting an already-known
      // email naturally resolves to the same contact record"). Never
      // creates a duplicate for an email already known to this tenant.
      const newContact = await app.contactStore.upsert(tenantSlug, newEmail)

      if (newContact.id === oldContactId) {
        // Already pointing at this contact -- e.g. a retried request with
        // the same newEmail, or newEmail normalizes to the account's
        // current address. Nothing to repoint, nothing to publish (a
        // migrated event with oldContactId === newContactId would be a
        // confusing no-op for herald's own consumer). Naturally
        // idempotent, matching this design's "retry converges" convention
        // rather than an explicit guard clause.
        return current
      }

      const results = await app.consequent.handle(accountId, 'account.change-email', { contactId: newContact.id })
      const rejection = results.find((r) => r?.rejected)
      if (rejection) {
        return reply.code(409).send({ error: rejection.reason?.message })
      }

      // ADR 0024's existing carry-forward mechanism (optOut, and per ADR
      // 0076, suppression), triggered by a real publisher for the first
      // time here -- herald's own consumer side was already built against
      // this exact contract (contact-lifecycle-consumer.ts), just never
      // had a caller until now.
      await app.publisher.publish('herald.contact.migrated', {
        tenant: tenantSlug,
        oldContactId,
        newContactId: newContact.id,
      })

      return fetchAccount(app, accountId)
    },
  )
}

export default accountRoutes
