import type { preHandlerHookHandler } from 'fastify'

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
  // ADR 0090: organization-scoped, held by end-user accounts (not tenant
  // admins) -- an account belongs to at most one organization, so unlike
  // every grant above, neither of these needs a companion scope object;
  // holding it at all means "for my own org" (see account_actor.ts's own
  // PermissionGrant.scope comment).
  'organization:manage',
  'organization-billing:manage',
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
 * ADR 0090: gates an organization's own management routes (add/remove
 * manager, org-scoped invites, successor management). Unlike every other
 * `requirePermission` grant, `organization:manage` needs no scope object
 * to disambiguate *which* organization it applies to -- an account belongs
 * to at most one, so the caller's own `claims.organizationId` (set by
 * enrichment from `account.organizationId`) is compared directly against
 * the route's `{organizationId}` param. A tenant admin holding
 * `accounts:manage` can act on any organization in their tenant, the same
 * admin-override shape every other self-service route in this codebase
 * already has (`requireSelfOrPermission`).
 */
export function requireOrganizationManager(paramName = 'organizationId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isOrgManager = claims?.enrichmentStatus === 'ok' && claims.organizationId === params[paramName] && claims.permissions.includes('organization:manage')
    const isTenantAdmin = claims?.enrichmentStatus === 'ok' && claims.permissions.includes('accounts:manage')
    if (!isOrgManager && !isTenantAdmin) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * Read-only gate for an organization's own detail (`GET .../organizations/
 * {organizationId}`) -- deliberately broader than `requireOrganizationManager`:
 * any member (not just a manager) can view who manages their own
 * organization and who's designated as each manager's successor, plus the
 * usual tenant-admin override. No `organization:manage`/
 * `organization-billing:manage` grant required at all for this read.
 */
export function requireOrganizationMember(paramName = 'organizationId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isMember = claims?.enrichmentStatus === 'ok' && claims.organizationId === params[paramName]
    const isTenantAdmin = claims?.enrichmentStatus === 'ok' && claims.permissions.includes('accounts:manage')
    if (!isMember && !isTenantAdmin) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * Voluntary departure (`DELETE .../organizations/{organizationId}/managers/
 * {accountId}` targeting your own accountId) needs no `organization:manage`
 * grant -- same self-action principle ADR 0070 already established for
 * ordinary accounts, extended to this route. Acting on a *different*
 * manager (involuntary removal) still needs `requireOrganizationManager`'s
 * checks.
 */
export function requireSelfOrOrganizationManager(orgParamName = 'organizationId', accountParamName = 'accountId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const isSelf = claims?.enrichmentStatus === 'ok' && claims.accountId === params[accountParamName]
    const isOrgManager = claims?.enrichmentStatus === 'ok' && claims.organizationId === params[orgParamName] && claims.permissions.includes('organization:manage')
    const isTenantAdmin = claims?.enrichmentStatus === 'ok' && claims.permissions.includes('accounts:manage')
    if (!isSelf && !isOrgManager && !isTenantAdmin) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}

/**
 * ADR 0090: strictly self-only, no org-manager or tenant-admin override --
 * a manager designating their own successor is deliberately narrower than
 * every other org route here. "A manager cannot set another manager's
 * successor" is the whole point (the ADR's own wording); an org-manager
 * override would let a co-manager quietly redirect a peer's succession,
 * and a tenant-admin override isn't needed since the operator tree
 * (`requireOperatorActor`) already covers the legitimate support/recovery
 * case for this route, same as everywhere else in this codebase.
 */
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
