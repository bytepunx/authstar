import type { InternalClaims, SessionClaims } from './types.js'

/**
 * Portcullis has no separate `email` claim on either JWT it issues -- `sub` *is* the
 * user's email, verbatim, by design (see authstar-middleware's
 * `jwt/{session,internal}.rs` doc comments on `sub`). This helper exists so consumers
 * don't have to rediscover that fact from portcullis's source; prefer it over reading
 * `claims.sub` directly at call sites where the intent is "get the email."
 *
 * **Caveat for API-key-authenticated tokens** (design/decisions/0101-api-keys.md,
 * `InternalClaims.apiKeyId`): a personal API key still resolves its owning account's
 * real email here, same as a session. But an **org-owned** key has no real person to
 * attribute one to -- `sub` is a synthetic, non-deliverable `apikey:{apiKeyId}` value
 * instead. Callers relying on this function's result for notifications, display, or
 * anything else that assumes a real, deliverable email address must check
 * `claims.apiKeyId` first and handle that case separately.
 */
export function getEmail(claims: SessionClaims | InternalClaims): string {
  return claims.sub
}
