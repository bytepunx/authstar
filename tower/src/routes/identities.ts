import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { IdentityState } from '../actors/identity_actor.js'
import type { AccountState } from '../actors/account_actor.js'
import type { InviteState } from '../actors/invite_actor.js'
import type { InviteCodeState } from '../actors/invite_code_actor.js'
import { searchCriteria } from '../lib/consequent-types.js'

// Per design/stories/tower/003-identity-resolution-at-login.md,
// 007-invites-and-invite-codes.md, and ADR 0027/0028. Called by
// portcullis's real Rust client (`authstar-middleware/src/identities.rs`)
// once per login -- same "the real client is the authoritative wire shape"
// note as `enrich.ts`. Response: `{ accountId, isNewAccount, redeemed }`
// (the third field folds in Story 007's invite-redemption outcome --
// portcullis's client only reads the first two, ignoring unknown fields).
//
// Both `invite` (token-based) and `inviteCode` (code-based, multi-
// redemption) redemption are wired here now -- `redeem.type` accepts
// either `"invite"` or `"inviteCode"`.

const resolveBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tenant', 'idp', 'identityHashes'],
  properties: {
    tenant: { type: 'string', minLength: 1 },
    idp: { type: 'string' },
    identityHashes: { type: 'array', items: { type: 'string' }, minItems: 1 },
    email: { type: 'string' },
    redeem: {
      type: 'object',
      oneOf: [
        {
          additionalProperties: false,
          required: ['type', 'token'],
          properties: { type: { type: 'string', enum: ['invite'] }, token: { type: 'string' } },
        },
        {
          additionalProperties: false,
          required: ['type', 'code'],
          properties: { type: { type: 'string', enum: ['inviteCode'] }, code: { type: 'string' } },
        },
      ],
    },
  },
} as const

interface ResolveBody {
  tenant: string
  idp: string
  identityHashes: string[]
  email?: string
  redeem?: { type: 'invite', token: string } | { type: 'inviteCode', code: string }
}

async function fetchIdentity(app: FastifyInstance, hash: string): Promise<IdentityState | null> {
  const instances = await app.consequent.find('identity', searchCriteria({ identityHash: hash }))
  const state = instances[0]?.state as unknown as IdentityState | undefined
  if (!state || !state.accountId) return null
  return state
}

const identitiesRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/identities/resolve', { schema: { body: resolveBodySchema } }, async (request, reply) => {
    const body = request.body as ResolveBody

    let accountId: string | undefined
    let matchedIndex = -1
    for (let i = 0; i < body.identityHashes.length; i++) {
      const identity = await fetchIdentity(app, body.identityHashes[i])
      if (identity) {
        accountId = identity.accountId
        matchedIndex = i
        break
      }
    }

    let isNewAccount = false

    if (accountId !== undefined) {
      // Alias forward (ADR 0028): a match on a non-current-generation
      // candidate creates an *additional* identity record keyed by the
      // current-generation hash, pointing at the same account -- future
      // logins converge directly on it. Idempotent: only created if the
      // current-gen hash doesn't already resolve.
      if (matchedIndex > 0) {
        const currentHash = body.identityHashes[0]
        const existing = await fetchIdentity(app, currentHash)
        if (!existing) {
          await app.consequent.handle(app.ids.nextIdentityId(), 'identity.create', {
            identityHash: currentHash,
            tenant: body.tenant,
            idp: body.idp,
            accountId,
          })
        }
      }
    } else {
      isNewAccount = true
      accountId = app.ids.nextAccountId()
      const contact = await app.contactStore.upsert(body.tenant, body.email ?? '')
      await app.consequent.handle(accountId, 'account.create', {
        accountId,
        tenant: body.tenant,
        contactId: contact.id,
      })
      await app.consequent.handle(app.ids.nextIdentityId(), 'identity.create', {
        identityHash: body.identityHashes[0],
        tenant: body.tenant,
        idp: body.idp,
        accountId,
      })
    }

    let redeemed = false
    if (body.redeem?.type === 'invite') {
      redeemed = await redeemInvite(app, body.redeem.token, accountId)
    } else if (body.redeem?.type === 'inviteCode') {
      redeemed = await redeemInviteCode(app, body.tenant, body.redeem.code, accountId)
    }

    return reply.code(200).send({ accountId, isNewAccount, redeemed })
  })
}

// Mismatch (expired, already-accepted, or contact doesn't match) is not an
// error -- login proceeds without the grant, per Story 007/ADR 0067's own
// "mismatch is not an error" rule.
async function redeemInvite(app: FastifyInstance, token: string, accountId: string): Promise<boolean> {
  const inviteInstance = await app.consequent.fetch('invite', token)
  const invite = inviteInstance?.state as unknown as InviteState | undefined
  if (!invite || invite.status !== 'pending') return false

  const accountInstance = await app.consequent.fetch('account', accountId)
  const account = accountInstance?.state as unknown as AccountState | undefined
  if (!account || account.contactId !== invite.contactId) return false

  const results = await app.consequent.handle(token, 'invite.accept', { accountId })
  if (results.some((r) => r.rejected)) return false

  await Promise.all([
    ...invite.roles.map((role) => app.consequent.handle(accountId, 'account.grant-role', { role })),
    // Story 007: "append permissions if present" -- the elevated-bootstrap
    // case (ADR 0021/0067's operator/first-admin invites). Previously
    // never actually applied on acceptance; see `account_actor.ts`'s own
    // `grantPermission` comment for the full history of this gap.
    ...invite.permissions.map((permission) => app.consequent.handle(accountId, 'account.grant-permission', { permission })),
  ])
  return true
}

// Same "mismatch/exhaustion is not an error, login proceeds anyway"
// posture as `redeemInvite` -- but no contact/email match check at all
// (Story 007: "there's no target to match against," `inviteCode` is
// deliberately not addressed to anyone in particular).
async function redeemInviteCode(app: FastifyInstance, tenant: string, code: string, accountId: string): Promise<boolean> {
  const key = `${tenant}:${code}`
  const inviteCodeInstance = await app.consequent.fetch('inviteCode', key)
  const inviteCode = inviteCodeInstance?.state as unknown as InviteCodeState | undefined
  if (!inviteCode || !inviteCode.createdAt) return false

  const results = await app.consequent.handle(key, 'inviteCode.redeem', {})
  if (results.some((r) => r.rejected)) return false

  // Permanent-vs-trial branch (ADR 0019): `trialDurationDays` set -> every
  // role lands in `trialRoles` with a computed expiry; unset -> permanent
  // `grantedRoles`, same as a token invite's own grants.
  if (inviteCode.trialDurationDays !== null) {
    const trialExpiresAt = new Date(Date.now() + inviteCode.trialDurationDays * 24 * 60 * 60 * 1000).toISOString()
    await Promise.all(
      inviteCode.roles.map((role) => app.consequent.handle(accountId, 'account.grant-trial-role', { role, trialExpiresAt })),
    )
  } else {
    await Promise.all(
      inviteCode.roles.map((role) => app.consequent.handle(accountId, 'account.grant-role', { role })),
    )
  }
  return true
}

export default identitiesRoutes
