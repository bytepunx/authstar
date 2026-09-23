// Auth extraction for steward's own `+server.ts` proxy endpoints.
//
// Steward itself never validates the token -- it has no way to (it's not
// tower's or keep's issuer, ADR 0045: "one shared operator token, each
// backend independently validates it against its own copy"). This module
// only handles steward's own two structural requirements, both explicit in
// Story 001:
//   1. Every proxied request needs *a* bearer token to forward at all (401
//      if missing -- there's nothing to send).
//   2. Every *mutating* proxied request needs `X-Operator-Actor` (400 if
//      missing on a mutation) -- steward "doesn't let a mutating action
//      proceed without it," per Story 001, since the label is guaranteed
//      present once connected. This is a client-side belt-and-suspenders
//      check; tower/herald enforce the same rule server-side regardless
//      (tower Story 010).
//
// Whether the *token itself* is valid is discovered only by tower's/
// herald's actual response (401 from them passes straight through) --
// steward has no independent way to pre-validate it.

import { error, type RequestEvent } from '@sveltejs/kit'

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export interface OperatorAuth {
  token: string
  actorLabel?: string
}

export interface ExtractOperatorAuthOptions {
  // Default true: mutating requests require X-Operator-Actor. The one
  // documented exception is `POST /tenants` (Story 002/tower Story 012) --
  // not on tower's operator route tree at all (it's a standalone,
  // pre-tenant ingress per tower Story 012), so tower's own
  // X-Operator-Actor enforcement (tower Story 010) doesn't apply to it.
  requireActor?: boolean
}

export function extractOperatorAuth(
  event: Pick<RequestEvent, 'request'>,
  options: ExtractOperatorAuthOptions = {},
): OperatorAuth {
  const requireActor = options.requireActor ?? true

  const authHeader = event.request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authHeader)
  const token = match?.[1]?.trim()
  if (!token) {
    throw error(401, { message: 'missing operator bearer token' })
  }

  const actorLabel = event.request.headers.get('x-operator-actor') ?? undefined

  if (requireActor && MUTATING_METHODS.has(event.request.method) && !actorLabel) {
    throw error(400, { message: 'X-Operator-Actor is required for mutating requests' })
  }

  return { token, actorLabel }
}
