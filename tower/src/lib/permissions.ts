import type { preHandlerHookHandler } from 'fastify'

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
