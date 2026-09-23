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

// Enforced here because this value is read from the token's *unverified* header (ADR 0089)
// and is about to be handed to `resolveDomain` and, from there, interpolated into a URL this
// process will fetch. Without this check, a crafted header (no valid signature required to
// reach this code -- jwtVerify's getKey callback runs before signature verification) could
// pass a resolver implementation an unexpected value (e.g. a `tenant` containing a `/` or
// `..`) it wasn't written to handle safely. Rejecting
// anything that isn't a single valid DNS label closes that off.
const TENANT_SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export interface PerTenantJwksKeyProviderOptions {
  /** Passed straight through to jose's `createRemoteJWKSet` for each tenant's JWKS fetch. */
  jwksOptions?: Parameters<typeof createRemoteJWKSet>[1]
}

/**
 * Verifies against a tenant resolved from the internal JWT's own `tenant` protected-header
 * field (ADR 0089), rather than one fixed JWKS URL -- the mechanism a non-Host-routed
 * service (tower/keep/herald/web) needs, since nothing about how a request arrives tells it
 * which tenant the token is for. Constructs `https://authstar.<domain>/.well-known/
 * jwks.json` (the tenant's reserved `authstar` application host, ADR 0091) and delegates to
 * a `createRemoteJWKSet` cached per tenant for the life of the process, so a high-traffic
 * tenant doesn't re-fetch its JWKS every request (mirrors `jwksKeyProvider`'s own single-URL
 * caching, just keyed per tenant here).
 *
 * `resolveDomain` looks up that tenant's registered domain -- tenants bring their own,
 * unrelated domains (ADR 0091), so there's no longer a formula from slug to host the way
 * `admin.<slug>.<baseDomain>` used to be. Called at most once per tenant slug for the life of
 * this provider (same cache as the JWKS fetch itself), so a network-backed resolver (e.g. one
 * that calls tower) isn't a per-request cost. Returning `undefined` means the tenant is
 * unknown to the resolver -- surfaced as `key-resolution-failed`, not `missing-claim`: the
 * token itself is fine, the failure is this service's own inability to resolve where to look,
 * the same distinction `jwksKeyProvider`'s network failures already get.
 *
 * Reading `protectedHeader.tenant` here happens *before* the signature is verified -- safe
 * for the same reason `kid`-based key selection already is (jose's own `getKey` doc comment:
 * "No token components have been verified at the time of this function call"). An unverified
 * hint is only ever used to pick which key to *attempt* verification with; a forged hint, a
 * forged signature, or a hint/signature mismatch all just fail verification the normal way.
 * See ADR 0089 for the full justification, including why a portcullis-forwarded header was
 * rejected in favor of this.
 */
export function perTenantJwksKeyProvider(
  resolveDomain: (tenantSlug: string) => string | undefined | Promise<string | undefined>,
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
      const domain = await resolveDomain(tenant)
      if (!domain) {
        throw new AuthstarJwtError('key-resolution-failed', `no domain registered for tenant ${tenant}`)
      }
      const url = new URL(`https://authstar.${domain}/.well-known/jwks.json`)
      getKey = createRemoteJWKSet(url, options?.jwksOptions)
      cache.set(tenant, getKey)
    }
    return getKey(protectedHeader, token)
  }
}
