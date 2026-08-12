import { createLocalJWKSet, createRemoteJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose'

/**
 * Verifies against a fixed, locally-held key set. The right choice for tests, or for any
 * deployment that prefers pinning keys over a runtime fetch -- `jwksKeyProvider()` below
 * is the recommended default otherwise, now that portcullis serves a live JWKS endpoint
 * (ADR 0086/0087). `jwks` is a standard JSON Web Key Set -- each key must carry the same
 * `kid` portcullis embeds in the token header (a fingerprint of its public key; fetch it
 * from `https://<tenant-host>/.well-known/jwks.json` rather than hand-copying key
 * material, since the `kid` has to match exactly for lookup to succeed).
 */
export function staticKeyProvider(jwks: JSONWebKeySet): JWTVerifyGetKey {
  return createLocalJWKSet(jwks)
}

/**
 * Verifies by fetching (and caching, with jose's own built-in kid-miss-triggers-refetch
 * behavior) a JWKS document over HTTP -- the recommended key-resolution path against a
 * real portcullis, which serves `GET /.well-known/jwks.json` per tenant (ADR 0086/0087).
 * `options` is passed straight through to jose's `createRemoteJWKSet` (cache TTL,
 * cooldown between fetches, request timeout, etc.).
 */
export function jwksKeyProvider(
  url: string | URL,
  options?: Parameters<typeof createRemoteJWKSet>[1],
): JWTVerifyGetKey {
  return createRemoteJWKSet(url instanceof URL ? url : new URL(url), options)
}
