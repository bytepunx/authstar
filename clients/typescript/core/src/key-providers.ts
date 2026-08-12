import { createLocalJWKSet, createRemoteJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose'

/**
 * Verifies against a fixed, locally-held key set -- fully usable today. portcullis has
 * no JWKS-serving route yet (see this repo's README), so this is the only option until
 * that lands; it's also the right choice for tests and for any deployment that prefers
 * pinning keys over a runtime fetch. `jwks` is a standard JSON Web Key Set -- each key
 * must carry the same `kid` portcullis embeds in the token header (a fingerprint of its
 * public key; ask your platform team for the tenant's current public JWK(s), not just
 * the raw key material, since the `kid` has to match exactly for lookup to succeed).
 */
export function staticKeyProvider(jwks: JSONWebKeySet): JWTVerifyGetKey {
  return createLocalJWKSet(jwks)
}

/**
 * Verifies by fetching (and caching, with jose's own built-in kid-miss-triggers-refetch
 * behavior) a JWKS document over HTTP. Not usable against portcullis today -- it has no
 * JWKS-serving route yet -- but wired up now so switching is a one-line change the
 * moment that route exists. `options` is passed straight through to jose's
 * `createRemoteJWKSet` (cache TTL, cooldown between fetches, request timeout, etc.).
 */
export function jwksKeyProvider(
  url: string | URL,
  options?: Parameters<typeof createRemoteJWKSet>[1],
): JWTVerifyGetKey {
  return createRemoteJWKSet(url instanceof URL ? url : new URL(url), options)
}
