import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { IdentityState } from '../actors/identity_actor.js'
import type { AccountState } from '../actors/account_actor.js'
import { filterRolesForApplication } from '../lib/roles.js'

// Per design/stories/tower/002-claims-enrichment-endpoint.md and ADR
// 0001/0003. Called by portcullis's real Rust client
// (`authstar-middleware/src/enricher.rs`) before every proxied request --
// that client's own wiremock-pinned contract is the authoritative wire
// shape here, more so than ADR prose (its own doc comment says as much:
// "the precise byte-for-byte wire shape may need adjusting once tower's
// real /enrich... is available"). This route's Allow-outcome response is
// shaped to match `AllowOutcome` in that file exactly (camelCase
// `accountId`/`grantedRoles`/`trialRoles`/`trialExpiresAt`/`usage`); Deny is
// signaled purely via a non-200 HTTP status (403), never a body field the
// Rust client's Allow-path parser would otherwise choke on.
//
// Auth: SPIFFE mTLS only, no independent JWT check -- this route runs
// *before* a session/token exists to have produced one, per ADR 0001/0003.
// `tenant` in the body is trusted as-is from the mTLS-authenticated caller
// (portcullis, having already resolved it from `Host`). This pilot slice
// does not implement mTLS verification at the fastify layer itself (no
// SPIFFE workload wiring in tests) -- see TESTING.md's scope note.

const enrichBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tenant', 'idp', 'identityHash', 'application'],
  properties: {
    tenant: { type: 'string', minLength: 1 },
    idp: { type: 'string' },
    identityHash: { type: 'string', minLength: 1 },
    email: { type: 'string' },
    application: { type: 'string', minLength: 1 },
  },
} as const

interface EnrichBody {
  tenant: string
  idp: string
  identityHash: string
  email?: string
  application: string
}

function deny(reply: { code: (n: number) => { send: (body: unknown) => unknown } }) {
  return reply.code(403).send({ error: 'Forbidden' })
}

async function fetchIdentity(app: FastifyInstance, identityHash: string): Promise<IdentityState | null> {
  const instances = await app.consequent.find('identity', { identityHash })
  const state = instances[0]?.state as unknown as IdentityState | undefined
  if (!state || !state.accountId) return null
  return state
}

async function fetchAccount(app: FastifyInstance, accountId: string): Promise<AccountState | null> {
  const instance = await app.consequent.fetch('account', accountId)
  const state = instance?.state as unknown as AccountState | undefined
  if (!state || !state.accountId) return null
  return state
}

const enrichRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/enrich', { schema: { body: enrichBodySchema } }, async (request, reply) => {
    const body = request.body as EnrichBody

    // Identity lookup fails -> Deny, never resolve-or-create -- an
    // established session hash resolving to nothing is anomalous, not an
    // implicit signup (that only happens at `/identities/resolve`).
    const identity = await fetchIdentity(app, body.identityHash)
    if (!identity) {
      return deny(reply)
    }

    const account = await fetchAccount(app, identity.accountId)
    if (!account || account.status === 'suspended' || account.status === 'deleted') {
      // `reason` is server-side-log-only, never in the response body.
      request.log?.info?.({ accountId: identity.accountId, status: account?.status }, 'enrich denied')
      return deny(reply)
    }

    return reply.code(200).send({
      outcome: 'allow',
      accountId: account.accountId,
      grantedRoles: filterRolesForApplication(account.grantedRoles, body.application),
      trialRoles: filterRolesForApplication(account.trialRoles, body.application),
      trialExpiresAt: account.trialExpiresAt ?? null,
      permissions: account.permissions,
      usage: account.usage.filter((u) => u.application === body.application),
    })
  })
}

export default enrichRoutes
