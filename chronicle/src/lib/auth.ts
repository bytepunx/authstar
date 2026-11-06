import type { preHandlerHookHandler } from 'fastify'

// Same posture as herald (ADR 0034, applied to chronicle by Story 002):
// behind portcullis, authorized via `permissions` claims on the forwarded
// internal JWT, independently re-verified by chronicle on top of portcullis
// already gating access. No operator tier -- chronicle has no bootstrap
// problem to solve.
//
// Verification itself is `authstarFastifyPlugin`'s (build-app.ts): it checks
// the ES256 signature against the tenant's JWKS, picked by the token's own
// `tenant` header (ADR 0086, ADR 0089, ADR 0091), and leaves
// `request.authstar` undefined when the token is missing or does not verify.
// This preHandler only reads those verified claims.

/**
 * `requirePermission('analytics:read')` as a route `preHandler`.
 * 401 when no verified token is present (missing, malformed, wrong
 * algorithm, unknown key, expired). 403 when the token verifies but names
 * another tenant than the route's `:tenantSlug`, is not `enrichmentStatus:
 * "ok"`, or lacks the permission.
 */
export function requirePermission(permission: string): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    if (!claims) {
      return reply.code(401).send({ error: 'missing or invalid internal token' })
    }

    const { tenantSlug } = request.params as { tenantSlug?: string }
    if (claims.tenant !== tenantSlug) {
      return reply.code(403).send({ error: 'token is not for this tenant' })
    }

    // A degraded token carries no grants by construction; it is denied on
    // that basis first, the permissions array second (herald's permissions.ts).
    const authorized = claims.enrichmentStatus === 'ok' && claims.permissions.includes(permission)
    if (!authorized) {
      return reply.code(403).send({ error: `missing required permission: ${permission}` })
    }
  }
}
