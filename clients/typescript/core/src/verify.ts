import { jwtVerify, errors as joseErrors, type JWTVerifyGetKey } from 'jose'
import type { EnrichmentStatus, InternalClaims, SessionClaims } from './types.js'
import { AuthstarJwtError } from './errors.js'

// jose's own error `.code` is more stable across versions than `instanceof` against a
// specific exported class -- this is the same reasoning signet-clients' own TypeScript
// package uses elsewhere in this org for mapping a third-party library's errors onto a
// stable, local error surface.
function mapJoseError(err: unknown): AuthstarJwtError {
  // A getKey callback (e.g. perTenantJwksKeyProvider) can throw its own AuthstarJwtError
  // before jose ever gets involved -- pass it through as-is rather than falling into the
  // generic 'malformed' branch below and losing the real reason.
  if (err instanceof AuthstarJwtError) {
    return err
  }
  if (err instanceof joseErrors.JWTExpired) {
    return new AuthstarJwtError('expired', 'token has expired', { cause: err })
  }
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    const reason = err.claim === 'iss' ? 'wrong-issuer' : err.claim === 'aud' ? 'wrong-audience' : 'malformed'
    return new AuthstarJwtError(reason, `claim validation failed: ${err.claim}`, { cause: err })
  }
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
    return new AuthstarJwtError('signature-invalid', 'signature verification failed', { cause: err })
  }
  if (err instanceof joseErrors.JWKSNoMatchingKey) {
    return new AuthstarJwtError('unknown-kid', 'no key matches this token\'s kid', { cause: err })
  }
  if (err instanceof joseErrors.JWKSTimeout || err instanceof joseErrors.JWKSInvalid) {
    return new AuthstarJwtError('key-resolution-failed', 'failed to resolve a verification key', { cause: err })
  }
  return new AuthstarJwtError('malformed', err instanceof Error ? err.message : 'invalid token', { cause: err })
}

export interface VerifySessionJwtOptions {
  /** Expected `iss` claim, e.g. "https://acme.authstar.app". */
  issuer: string
  /** Expected `aud` claim -- the tenant slug, e.g. "acme". */
  audience: string
  /**
   * jose's own clock-skew allowance, in seconds. Default 5s. Keep this small: the
   * internal JWT's own 60-second TTL (see InternalClaims's doc comment) means generous
   * skew tolerance meaningfully erodes its already-short validity window.
   */
  clockToleranceSeconds?: number
}

/** Verifies the long-lived `jwt` session cookie. See SessionClaims's doc comment. */
export async function verifySessionJwt(
  token: string,
  getKey: JWTVerifyGetKey,
  options: VerifySessionJwtOptions,
): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, getKey, {
    issuer: options.issuer,
    audience: options.audience,
    algorithms: ['ES256'],
    clockTolerance: options.clockToleranceSeconds ?? 5,
  }).catch((err: unknown) => {
    throw mapJoseError(err)
  })

  if (typeof payload.sub !== 'string' || typeof payload.idp !== 'string' || typeof payload.identityHash !== 'string') {
    throw new AuthstarJwtError('missing-claim', 'session JWT missing a required claim (sub/idp/identityHash)')
  }

  return {
    sub: payload.sub,
    idp: payload.idp as string,
    identityHash: payload.identityHash as string,
    iss: payload.iss as string,
    aud: payload.aud as string,
    iat: payload.iat as number,
    exp: payload.exp as number,
  }
}

export interface VerifyInternalJwtOptions {
  /** See VerifySessionJwtOptions.clockToleranceSeconds -- same default, same reasoning. */
  clockToleranceSeconds?: number
}

/**
 * Verifies the short-lived, upstream-facing internal JWT. See InternalClaims's own
 * doc comment for the enrichmentStatus/fail-open contract -- this function returns a
 * "degraded" token successfully (it's a real, valid, portcullis-signed token), it's the
 * caller's job to decide what a degraded identity is allowed to do.
 *
 * No issuer/audience check here: the internal JWT carries neither claim (confirmed
 * against authstar-middleware's own InternalClaims struct) -- multi-tenancy is
 * entirely the caller's responsibility, via which tenant's `getKey` it supplies.
 */
export async function verifyInternalJwt(
  token: string,
  getKey: JWTVerifyGetKey,
  options: VerifyInternalJwtOptions = {},
): Promise<InternalClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, getKey, {
    algorithms: ['ES256'],
    clockTolerance: options.clockToleranceSeconds ?? 5,
  }).catch((err: unknown) => {
    throw mapJoseError(err)
  })

  if (typeof payload.sub !== 'string' || typeof payload.idp !== 'string' || typeof payload.identityHash !== 'string') {
    throw new AuthstarJwtError('missing-claim', 'internal JWT missing a required claim (sub/idp/identityHash)')
  }
  const enrichmentStatus = payload.enrichmentStatus
  if (enrichmentStatus !== 'ok' && enrichmentStatus !== 'degraded') {
    throw new AuthstarJwtError('missing-claim', 'internal JWT missing or invalid enrichmentStatus claim')
  }
  // Sourced from the *verified* header (ADR 0089) -- read only now, after jwtVerify has
  // already confirmed the signature, not re-trusted from the pre-verification hint
  // perTenantJwksKeyProvider read to pick a key.
  const tenant = (protectedHeader as { tenant?: unknown }).tenant
  if (typeof tenant !== 'string' || tenant.length === 0) {
    throw new AuthstarJwtError('missing-claim', 'internal JWT header missing tenant claim')
  }

  return {
    sub: payload.sub,
    idp: payload.idp as string,
    identityHash: payload.identityHash as string,
    tenant,
    enrichmentStatus: enrichmentStatus as EnrichmentStatus,
    accountId: typeof payload.accountId === 'string' ? payload.accountId : undefined,
    organizationId: typeof payload.organizationId === 'string' ? payload.organizationId : undefined,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
    permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
    usage: payload.usage,
    isNewAccount: typeof payload.isNewAccount === 'boolean' ? payload.isNewAccount : undefined,
    iat: payload.iat as number,
    exp: payload.exp as number,
  }
}
