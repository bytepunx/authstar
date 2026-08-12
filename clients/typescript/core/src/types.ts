// Claim shapes mirror authstar/portcullis/crates/authstar-middleware/src/jwt/
// {session,internal}.rs's actual serde structs exactly -- confirmed against that
// source, not guessed or copied from an aspirational/unverified consumer. In
// particular InternalClaims deliberately has no `permissions` or standalone `email`
// field: `sub` already carries the user's email (see internal.rs's own comment), and
// no `permissions` claim exists on the wire today, whatever an earlier, not-yet-wired
// consumer's local type may have assumed.

/** The long-lived `jwt` cookie portcullis issues after a successful login. */
export interface SessionClaims {
  /** The user's email, as reported by the upstream IdP. */
  sub: string
  /** The provider id that authenticated this session, e.g. "dex". */
  idp: string
  identityHash: string
  /** Tenant-scoped issuer, e.g. "https://acme.authstar.app". */
  iss: string
  /** The tenant slug, e.g. "acme". */
  aud: string
  iat: number
  exp: number
}

export type EnrichmentStatus = 'ok' | 'degraded'

/**
 * The 60-second, upstream-facing `Authorization: Bearer` token portcullis mints fresh
 * on every proxied request (authstar-middleware's own doc comment: "downstream
 * services verify it independently against the tenant's public key" -- this is that
 * verification). `enrichmentStatus: "degraded"` is portcullis's fail-open path when
 * tower's `/enrich` is unreachable -- `roles`/`usage`/`accountId` are deliberately
 * absent in that case, never fabricated. Treat a degraded token as authenticated with
 * reduced trust, not as an error to reject.
 */
export interface InternalClaims {
  sub: string
  idp: string
  identityHash: string
  enrichmentStatus: EnrichmentStatus
  /** Absent when enrichmentStatus is "degraded", or when tower reports no account yet. */
  accountId?: string
  /** Always present; empty when enrichmentStatus is "degraded". */
  roles: string[]
  /** Tower-sourced usage/entitlement data; shape is tower's concern, not this library's. */
  usage?: unknown
  /** Present (true) only immediately after tower auto-provisioned a brand-new account. */
  isNewAccount?: boolean
  iat: number
  exp: number
}
