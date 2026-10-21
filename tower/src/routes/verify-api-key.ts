import type { FastifyInstance, FastifyPluginAsync, RouteShorthandOptions } from 'fastify'
import type { ApiKeyState } from '../actors/api_key_actor.js'
import type { AccountState } from '../actors/account_actor.js'
import type { OrganizationState } from '../actors/organization_actor.js'
import { filterRolesForApplication } from '../lib/roles.js'
import { verifyApiKeySecret } from '../lib/api-key-secret.js'
import { requireSpiffePeer } from '../lib/spiffe-mtls.js'

// Per design/adrs/0101-api-keys.md. Called by portcullis
// (`authstar-middleware/src/api_key_verifier.rs`) on every request bearing
// an `Authorization: Bearer authstar_{apiKeyId}_{secret}` credential --
// the API-key analogue of `enrich.ts`'s `/enrich`, reusing the exact same
// SPIFFE-gated, `Allow`/`Deny`-via-status-code posture (ADR 0001/0003) so
// portcullis's existing `handle_enrichment_outcome` machinery handles both
// credential types without a parallel code path.
//
// **Never returns `apiKey.grantedRoles` directly.** The response's
// `grantedRoles` is always `effectiveRoles = intersect(apiKey.grantedRoles,
// currentOwnerRolesForApplication)`, recomputed fresh on every call -- a
// key's own `grantedRoles` (chosen once, at creation, immutable) is a
// ceiling, never assumed to still be a live truth on its own. If an
// owner's plan lapses and a role disappears, any key that depended on it
// loses effective access on its very next verification, with no need to
// touch the key record itself.
//
// `permissions` is always `[]` and `trialRoles`/`trialExpiresAt` are always
// empty/`null` -- API keys never carry tower's own closed
// `PERMISSION_CATALOG` grants (ADR 0079's "narrow blast radius" framing,
// applied here) and don't participate in trials at all.

const verifyBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['tenant', 'application', 'apiKeyId', 'secret'],
  properties: {
    tenant: { type: 'string', minLength: 1 },
    application: { type: 'string', minLength: 1 },
    apiKeyId: { type: 'string', minLength: 1 },
    secret: { type: 'string', minLength: 1 },
  },
} as const

interface VerifyBody {
  tenant: string
  application: string
  apiKeyId: string
  secret: string
}

function deny(reply: { code: (n: number) => { send: (body: unknown) => unknown } }) {
  return reply.code(403).send({ error: 'Forbidden' })
}

async function fetchApiKey(app: FastifyInstance, apiKeyId: string): Promise<ApiKeyState | null> {
  const instance = await app.consequent.fetch('apiKey', apiKeyId)
  const state = instance?.state as unknown as ApiKeyState | undefined
  if (!state?.createdAt) return null
  return state
}

interface OwnerVerification {
  sub: string
  accountId: string | undefined
  currentRoles: string[]
  rateLimit: { requestsPerMinute: number, burst?: number } | null
}

// One fetch per owner kind, not two (`currentOwnerRolesForApplication`
// and `rateLimitForOwner` used to be separate functions, each re-fetching
// the same account/organization instance).
//
// `sub` -- per design/adrs/0101-api-keys.md's baseline-identity
// decision: a personal key resolves the owning account's real email (via
// `contactStore`, same source `/enrich` itself never needed to touch since
// a session's own `sub` already *is* the verified email); an org-owned key
// has no real person to attribute one to, so it gets a synthetic,
// non-deliverable `apikey:{apiKeyId}` -- documented as a caller-facing
// caveat in `authstar-core`'s `identity.ts` (Part D).
//
// Also see `routes/api-keys.ts`'s own comment on why this can't be a
// shared `filterRolesForApplication` call for both owner kinds:
// `organization`'s `grantedRoles` is `{application, role}[]`, not
// account's `{name, scope}[]`.
async function resolveOwnerVerification(app: FastifyInstance, apiKey: ApiKeyState): Promise<OwnerVerification | null> {
  if ('account' in apiKey.owner) {
    const instance = await app.consequent.fetch('account', apiKey.owner.account)
    const state = instance?.state as unknown as AccountState | undefined
    if (!state?.createdAt || state.status !== 'active') return null
    const contact = await app.contactStore.findById(state.contactId)
    return {
      sub: contact?.email ?? `apikey:${apiKey.apiKeyId}`,
      accountId: state.accountId,
      currentRoles: filterRolesForApplication(state.grantedRoles, apiKey.application),
      rateLimit: state.apiKeyRateLimit,
    }
  }
  const instance = await app.consequent.fetch('organization', apiKey.owner.organization)
  const state = instance?.state as unknown as OrganizationState | undefined
  if (!state?.createdAt) return null
  return {
    sub: `apikey:${apiKey.apiKeyId}`,
    accountId: undefined,
    currentRoles: state.grantedRoles.filter((r) => r.application === apiKey.application).map((r) => r.role),
    rateLimit: state.apiKeyRateLimit,
  }
}

const verifyApiKeyRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  const routeOptions: RouteShorthandOptions = {
    schema: { body: verifyBodySchema },
    ...(app.spiffeTrustDomain ? { preHandler: requireSpiffePeer(app.spiffeTrustDomain) } : {}),
  }

  app.post('/verify-api-key', routeOptions, async (request, reply) => {
    const body = request.body as VerifyBody

    const apiKey = await fetchApiKey(app, body.apiKeyId)
    if (!apiKey || apiKey.tenant !== body.tenant || apiKey.application !== body.application || apiKey.status !== 'active') {
      return deny(reply)
    }

    if (!verifyApiKeySecret(body.secret, apiKey.salt, apiKey.hashedSecret)) {
      request.log?.info?.({ apiKeyId: body.apiKeyId }, 'verify-api-key denied -- secret mismatch')
      return deny(reply)
    }

    const ownerVerification = await resolveOwnerVerification(app, apiKey)
    if (!ownerVerification) {
      // Owner no longer exists, or an account owner is suspended/deleted --
      // same "anomalous, deny outright" posture `enrich.ts` takes for a
      // missing/inactive account.
      return deny(reply)
    }

    const effectiveRoles = apiKey.grantedRoles.filter((r) => ownerVerification.currentRoles.includes(r))

    return reply.code(200).send({
      outcome: 'allow',
      apiKeyId: apiKey.apiKeyId,
      sub: ownerVerification.sub,
      accountId: ownerVerification.accountId,
      grantedRoles: effectiveRoles,
      trialRoles: [],
      trialExpiresAt: null,
      permissions: [],
      usage: [],
      rateLimit: ownerVerification.rateLimit,
    })
  })
}

export default verifyApiKeyRoutes
