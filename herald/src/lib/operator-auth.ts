// Shared operator-bearer-token check (ADR 0021/0045's "one shared operator
// token" model, extended to herald for the first time by ADR 0081) --
// identical mechanism to tower's own `src/lib/operator-auth.ts`, not
// reinvented here. Herald has no per-tenant operator concept at all
// (ADR 0081: "no tenantSlug in the path -- these keys aren't tenant-
// scoped"), so this is the *only* operator check this service needs.
export function isOperatorRequest(headers: Record<string, unknown>, operatorToken: string): boolean {
  if (!operatorToken) return false
  const raw = headers['authorization']
  if (typeof raw !== 'string') return false
  const match = /^Bearer\s+(.+)$/i.exec(raw)
  return Boolean(match && match[1] === operatorToken)
}
