import type { preHandlerHookHandler, FastifyRequest } from 'fastify'
import type { AccountState } from '../actors/account_actor.js'
import { filterRolesForApplication } from './roles.js'

// ADR 0051's consolidated permissions catalog table -- "treated as the
// canonical list going forward." Deduplicated (the table lists
// `billing:manage` twice, once per introducing ADR, same grant string
// both times). `routes/accounts.ts`'s `POST .../permissions` is this
// catalog's first real consumer: Story 005 requires it "rejects anything
// else outright rather than accepting and silently ignoring an
// unrecognized grant string."
export const PERMISSION_CATALOG = [
  'applications:manage',
  'accounts:manage',
  'roles:manage',
  'permissions:manage',
  'contacts:read',
  'invite:send',
  'invite:code:issue',
  'providers:manage',
  'billing:manage',
  'communication-types:manage',
  'communications:read',
  'opt-outs:manage',
  'sending-config:manage',
  'erasure-requests:read',
  'contacts:export',
  'analytics:read',
  'activity:read',
  'billing:read',
  'tenant:manage',
  'suppressions:manage',
  'contacts:erase',
] as const

// Permission-enforcement middleware (Story 014, ADR 0018/0030/0051). This is
// the missing mechanism every tenant-scoped route story (004 onward) has
// been writing "Gated by `<grant>`" against without anything actually
// checking it -- see each route file's own "no RBAC middleware exists yet"
// scope note, now resolved.
//
// Tenant resolution for the JWKS fetch that verifies the token in the first
// place is ADR 0089's concern (`perTenantJwksKeyProvider`, wired in
// build-app.ts) -- by the time a `preHandler` here runs, `request.authstar`
// is either a verified `InternalClaims` or undefined; this module only
// decides what a route requires of it.

/**
 * `requirePermission('billing:manage')` as a route `preHandler`. Fails
 * closed on every non-`ok` case with one generic 403 -- no distinction
 * between "no token", "invalid token", "degraded token", and "valid token,
 * wrong grant" (Story 014: matches `Deny`'s own posture elsewhere in this
 * design, reason is server-side-log-only, never in the response body).
 *
 * `enrichmentStatus: "degraded"` is treated as no permissions *regardless*
 * of what `permissions` actually contains -- portcullis never fabricates
 * grants for a degraded token, but this still doesn't trust an empty array
 * alone as "correctly checked and denied": a token that somehow isn't
 * `"ok"` is denied on that basis first, array contents second.
 */
export function requirePermission(grant: string): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const authorized = claims?.enrichmentStatus === 'ok' && claims.permissions.includes(grant)
    if (!authorized) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * ADR 0070's self-action principle ("acting on your own `accountId` needs
 * no `permissions` grant") -- but only where a story explicitly extends it;
 * most routes in this codebase use plain `requirePermission` instead
 * because the principle deliberately does NOT cover privilege-relevant
 * actions (granting/revoking your own roles or permissions, tower Story
 * 005's own explicit carve-out). `paramName` is the route param holding
 * the target `accountId` (almost always `'accountId'`) -- compared against
 * `request.authstar.accountId`, a real internal-JWT claim (confirmed
 * against `spec/lib/internal-jwt.ts`'s fixture shape), not re-derived from
 * anything else.
 */
export function requireSelfOrPermission(grant: string, paramName = 'accountId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isSelf = claims?.enrichmentStatus === 'ok' && claims.accountId === params[paramName]
    const authorized = isSelf || (claims?.enrichmentStatus === 'ok' && claims.permissions.includes(grant))
    if (!authorized) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * ADR 0100: an account can hold membership in more than one organization,
 * each with its own independent `roles` list -- finds the caller's
 * membership entry for one specific organization (by id), or `null` if the
 * account isn't a member of it at all (including when the token is
 * degraded, where no membership claim is trusted).
 */
function membershipRoles(claims: FastifyRequest['authstar'], organizationId: string): string[] | null {
  if (claims?.enrichmentStatus !== 'ok') return null
  const membership = claims.organizationMemberships.find((m) => m.organizationId === organizationId)
  return membership ? membership.roles : null
}

/**
 * ADR 0100: gates an organization's own management routes (invite, promote/
 * demote, remove members, grant/revoke billing roles) -- the caller must
 * hold the `manager` role on a membership record for *this specific*
 * organization (looked up by the route's `{organizationId}` param), not
 * merely belong to it. A tenant admin holding `accounts:manage` can act on
 * any organization in their tenant, the same admin-override shape every
 * other self-service route in this codebase already has
 * (`requireSelfOrPermission`).
 */
export function requireOrganizationManager(paramName = 'organizationId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isOrgManager = membershipRoles(claims, params[paramName])?.includes('manager') ?? false
    const isTenantAdmin = claims?.enrichmentStatus === 'ok' && claims.permissions.includes('accounts:manage')
    if (!isOrgManager && !isTenantAdmin) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * Read-only gate for an organization's own detail (`GET .../organizations/
 * {organizationId}`) -- deliberately broader than `requireOrganizationManager`:
 * any member (not just a manager) can view their own organization, plus the
 * usual tenant-admin override. No specific membership role required, just
 * membership at all.
 */
export function requireOrganizationMember(paramName = 'organizationId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isMember = membershipRoles(claims, params[paramName]) !== null
    const isTenantAdmin = claims?.enrichmentStatus === 'ok' && claims.permissions.includes('accounts:manage')
    if (!isMember && !isTenantAdmin) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * Voluntary departure (`DELETE .../organizations/{organizationId}/members/
 * {accountId}` targeting your own accountId) needs no `manager` role --
 * same self-action principle ADR 0070 already established for ordinary
 * accounts, extended to this route. Acting on a *different* member
 * (involuntary removal) still needs `requireOrganizationManager`'s checks.
 */
export function requireSelfOrOrganizationManager(orgParamName = 'organizationId', accountParamName = 'accountId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isSelf = claims?.enrichmentStatus === 'ok' && claims.accountId === params[accountParamName]
    const isOrgManager = membershipRoles(claims, params[orgParamName])?.includes('manager') ?? false
    const isTenantAdmin = claims?.enrichmentStatus === 'ok' && claims.permissions.includes('accounts:manage')
    if (!isSelf && !isOrgManager && !isTenantAdmin) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * ADR 0100: strictly self-only, no org-manager or tenant-admin override --
 * a manager designating their own successor is deliberately narrower than
 * every other org route here. "A manager cannot set another manager's
 * successor" is the whole point; an org-manager override would let a
 * co-manager quietly redirect a peer's succession, and a tenant-admin
 * override isn't needed since the operator tree (`requireOperatorActor`)
 * already covers the legitimate support/recovery case for this route, same
 * as everywhere else in this codebase.
 */
/**
 * design/adrs/0101-api-keys.md: gates `routes/api-keys.ts`'s personal
 * (non-organization) key routes on the caller holding a specific
 * application-scope role -- `api-keys:manage` is this route's only real
 * caller today, but this is written generically (any app-scope role name).
 *
 * **Deliberately does not use `request.authstar.roles`**, unlike every
 * other gate in this file that reads straight off the verified token.
 * `claims.roles` is portcullis's own `grantedRoles + active trialRoles`,
 * already filtered by `/enrich`'s `application` field to whatever
 * application the *current inbound request* was proxied for (confirmed
 * directly against portcullis's `enricher.rs`) -- for a request landing on
 * tower's own API, that's tower's own admin-surface application slug, not
 * the arbitrary tenant `{appSlug}` route param this route needs to check
 * roles against. So this fetches the account's live `grantedRoles` directly
 * (same live-lookup pattern `routes/invite-codes.ts`'s own
 * `callerMaxOutstanding` already uses) and filters with the same
 * `filterRolesForApplication` helper `/enrich` itself uses, just against
 * `{appSlug}` instead of the request's own proxied application.
 */
export function requireAppRole(roleName: string, appParamName = 'appSlug'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    if (claims?.enrichmentStatus !== 'ok' || !claims.accountId) {
      return reply.code(403).send({ error: 'forbidden' })
    }
    if (claims.permissions.includes('accounts:manage')) return

    const instance = await request.server.consequent.fetch('account', claims.accountId)
    const state = instance?.state as unknown as AccountState | undefined
    const roles = state ? filterRolesForApplication(state.grantedRoles, params[appParamName]) : []
    if (!roles.includes(roleName)) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

export function requireSelf(paramName = 'accountId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isSelf = claims?.enrichmentStatus === 'ok' && claims.accountId === params[paramName]
    if (!isSelf) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}
