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
