import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'

// Shared operator-bearer-token check (ADR 0021/0045's "one shared operator
// token" model) -- steward sends `Authorization: Bearer <token>` for every
// operator call, including `POST /tenants` (provisioning) and
// `POST /operator/tenants/:tenantSlug/rotate-keys`, via one uniform client
// helper (`steward/src/lib/server/backend-client.ts`). Both tower routes
// that gate on an operator token need to agree with what steward actually
// sends -- this used to be duplicated ad hoc as an `x-operator-token`
// header check in each route, which steward never sends at all.
export function isOperatorRequest(headers: Record<string, unknown>, operatorToken: string): boolean {
  if (!operatorToken) return false
  const raw = headers['authorization']
  if (typeof raw !== 'string') return false
  const match = /^Bearer\s+(.+)$/i.exec(raw)
  return Boolean(match && match[1] === operatorToken)
}

// `preHandler` form of the check above -- for read-only operator routes
// (Story 013's `GET /operator/...` tree), which need the bearer token but
// have nothing to attribute, so `X-Operator-Actor` isn't required.
export function requireOperatorAuth(app: FastifyInstance): preHandlerHookHandler {
  return async (request, reply) => {
    if (!isOperatorRequest(request.headers, app.provisioningConfig.operatorToken)) {
      return reply.code(403).send({ error: 'operator bearer token required' })
    }
  }
}

// Story 010/013: every *mutating* operator request requires
// `X-Operator-Actor` -- steward's own connect-time label, forwarded on
// every call it makes -- threaded into the resulting event's own
// `actingAs` metadata at write time (see `operatorActor` below and each
// mutating command handler's own `...actingAsFields(command)` spread).
// This is the only accountability signal available on this
// shared-credential surface (ADR 0045's own framing), so a mutating
// request missing it is rejected outright (`400`), not silently allowed
// through unattributed.
export function requireOperatorActor(app: FastifyInstance): preHandlerHookHandler {
  return async (request, reply) => {
    if (!isOperatorRequest(request.headers, app.provisioningConfig.operatorToken)) {
      return reply.code(403).send({ error: 'operator bearer token required' })
    }
    const actor = request.headers['x-operator-actor']
    if (typeof actor !== 'string' || actor.trim() === '') {
      return reply.code(400).send({ error: 'X-Operator-Actor header is required for mutating operator requests' })
    }
  }
}

// Reads the attribution label a `requireOperatorActor`-gated route already
// validated is present. Also used, unvalidated, by tenant-scoped routes
// reused as the operator handler's own shared implementation -- those
// calls simply never carry the header, so this returns `undefined` and no
// `actingAs` field is attached, exactly as before this story.
export function operatorActor(request: FastifyRequest): string | undefined {
  const value = request.headers['x-operator-actor']
  return typeof value === 'string' ? value : undefined
}
