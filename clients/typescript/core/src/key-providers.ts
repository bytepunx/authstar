import { createLocalJWKSet, createRemoteJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose'
import { AuthstarJwtError } from './errors.js'

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

// Tenant slugs are already constrained to this shape everywhere else they appear as a
// hostname component (ADR 0067's `admin.<slug>.<baseDomain>` provisioning convention) --
// enforced again here because this value is read from the token's *unverified* header
// (ADR 0089) and is about to be interpolated directly into a URL this process will fetch.
// Without this check, a crafted header (no valid signature required to reach this code --
// jwtVerify's getKey callback runs before signature verification) could redirect that
// fetch to an attacker-chosen host, e.g. a `tenant` value containing a `/`. Rejecting
// anything that isn't a single valid DNS label closes that off.
const TENANT_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export interface PerTenantJwksKeyProviderOptions {
  /** Passed straight through to jose's `createRemoteJWKSet` for each tenant's JWKS fetch. */
  jwksOptions?: Parameters<typeof createRemoteJWKSet>[1]
}

/**
 * Verifies against a tenant resolved from the internal JWT's own `tenant` protected-header
 * field (ADR 0089), rather than one fixed JWKS URL -- the mechanism a non-Host-routed
 * service (tower/keep/herald) needs, since nothing about how a request arrives tells it
 * which tenant the token is for. Constructs
 * `https://admin.<tenant-slug>.<baseDomain>/.well-known/jwks.json` (the tenant's `_admin`
 * application host, ADR 0067) and delegates to a `createRemoteJWKSet` cached per tenant for
 * the life of the process, so a high-traffic tenant doesn't re-fetch its JWKS every request
 * (mirrors `jwksKeyProvider`'s own single-URL caching, just keyed per tenant here).
 *
 * Reading `protectedHeader.tenant` here happens *before* the signature is verified -- safe
 * for the same reason `kid`-based key selection already is (jose's own `getKey` doc comment:
 * "No token components have been verified at the time of this function call"). An unverified
 * hint is only ever used to pick which key to *attempt* verification with; a forged hint, a
 * forged signature, or a hint/signature mismatch all just fail verification the normal way.
 * See the ADR for the full justification, including why a portcullis-forwarded header was
 * rejected in favor of this.
 */
export function perTenantJwksKeyProvider(
  baseDomain: string,
  options?: PerTenantJwksKeyProviderOptions,
): JWTVerifyGetKey {
  const cache = new Map<string, JWTVerifyGetKey>()

  return async (protectedHeader, token) => {
    const tenant = (protectedHeader as { tenant?: unknown }).tenant
    if (typeof tenant !== 'string' || !TENANT_SLUG_PATTERN.test(tenant)) {
      throw new AuthstarJwtError('missing-claim', 'internal JWT header is missing a valid tenant hint')
    }
    let getKey = cache.get(tenant)
    if (!getKey) {
      const url = new URL(`https://admin.${tenant}.${baseDomain}/.well-known/jwks.json`)
      getKey = createRemoteJWKSet(url, options?.jwksOptions)
      cache.set(tenant, getKey)
    }
    return getKey(protectedHeader, token)
  }
}
