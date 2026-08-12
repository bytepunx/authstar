import type { InternalClaims, SessionClaims } from './types.js'

/**
 * Portcullis has no separate `email` claim on either JWT it issues -- `sub` *is* the
 * user's email, verbatim, by design (see authstar-middleware's
 * `jwt/{session,internal}.rs` doc comments on `sub`). This helper exists so consumers
 * don't have to rediscover that fact from portcullis's source; prefer it over reading
 * `claims.sub` directly at call sites where the intent is "get the email."
 */
export function getEmail(claims: SessionClaims | InternalClaims): string {
  return claims.sub
}
