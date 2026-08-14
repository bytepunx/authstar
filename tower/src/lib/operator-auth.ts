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
