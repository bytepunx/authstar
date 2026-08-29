import type { preHandlerHookHandler } from 'fastify'

// Permission-enforcement middleware (Story 007, ADR 0018/0030/0051) --
// identical mechanism to tower's own `src/lib/permissions.ts` (Story 014),
// not reinvented here. See that file's doc comment for the full rationale;
// this repo just doesn't have its own self-action-exemption concept (keep
// has no account/identity model of its own -- ADR 0070 is a tower-only
// concern).

/**
 * `requirePermission('billing:manage')` as a route `preHandler`. Fails
 * closed on every non-`ok` case with one generic 403 -- no distinction
 * between "no token", "invalid token", "degraded token", and "valid token,
 * wrong grant".
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
 * ADR 0100: gates keep's Billing Portal session route. An account can
 * belong to more than one organization now, each with its own independent
 * membership roles -- so this looks up the caller's membership entry for
 * *this specific* organization (the route's `{organizationId}` param) and
 * checks it holds `billingAdmin` (full control) or `billingViewer`
 * (read-only, admitted here too since a view-only Billing Portal surface
 * doesn't exist yet to gate more narrowly -- the role is seeded regardless,
 * ready for that later).
 */
export function requireOrganizationAccess(paramName = 'organizationId'): preHandlerHookHandler {
  return async (request, reply) => {
    const claims = request.authstar
    const params = request.params as Record<string, string>
    const membership = claims?.enrichmentStatus === 'ok'
      ? claims.organizationMemberships.find((m) => m.organizationId === params[paramName])
      : undefined
    const authorized = Boolean(membership && (membership.roles.includes('billingAdmin') || membership.roles.includes('billingViewer')))
    if (!authorized) {
      return reply.code(403).send({ error: 'forbidden' })
    }
  }
}
