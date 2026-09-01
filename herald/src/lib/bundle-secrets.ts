// ADR 0102's "missing bundle field in Signet-Configured Mode = fail loud, not
// fall back" rule, factored out so `src/server.ts` (always Signet-Configured
// per that same ADR -- herald has no Env-Only Mode) can apply it uniformly
// to every secret it treats as a hard requirement, instead of each call site
// growing its own `?? requireEnv(...)` or `?? ''` fallback. Both of
// server.ts's own pre-ADR-0102 fallbacks (`signetAdminToken`'s env
// fallback, `operatorToken`'s `''` literal) are exactly the two patterns
// this closes -- see ADR 0102's Context #2 for the fuller incident writeup
// of why those were silent failure modes, not harmless defaults.
export function requireBundleSecret(secrets: Record<string, string>, field: string): string {
  const value = secrets[field]
  if (!value) {
    throw new Error(
      `signet bundle missing required secret '${field}' -- provision it in herald's signet secret bundle (see ADR 0102: Signet-Configured Mode never falls back to env or a hardcoded default for a missing secret)`
    )
  }
  return value
}
