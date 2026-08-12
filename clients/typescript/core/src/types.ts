// Claim shapes mirror authstar/portcullis/crates/authstar-middleware/src/jwt/
// {session,internal}.rs's actual serde structs exactly -- confirmed against that
// source, not guessed or copied from an aspirational/unverified consumer. There is no
// standalone `email` field on either claim type by design -- `sub` already carries the
// user's email verbatim (see internal.rs's own comment; use `getEmail()` from this
// package rather than reading `.sub` at call sites).

/** The long-lived `jwt` cookie portcullis issues after a successful login. */
export interface SessionClaims {
  /** The user's email. There is no separate email claim -- use `getEmail()`. */
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
 * tower's `/enrich` is unreachable -- `roles`/`permissions`/`usage`/`accountId` are
 * deliberately absent in that case, never fabricated. Treat a degraded token as
 * authenticated with reduced trust, not as an error to reject.
 */
export interface InternalClaims {
  /** The user's email. There is no separate email claim -- use `getEmail()`. */
  sub: string
  idp: string
  identityHash: string
  enrichmentStatus: EnrichmentStatus
  /** Absent when enrichmentStatus is "degraded", or when tower reports no account yet. */
  accountId?: string
  /** Open, app-owned vocabulary (ADR 0069). Always present; empty when enrichmentStatus is "degraded". */
  roles: string[]
  /**
   * Closed, authstar-owned vocabulary tower's own authorization is built on (ADR 0018/
   * 0030) -- permanently distinct from `roles` above, never merged with it (ADR 0069).
   * Always present; empty when enrichmentStatus is "degraded".
   */
  permissions: string[]
  /** Tower-sourced usage/entitlement data; shape is tower's concern, not this library's. */
  usage?: unknown
  /** Present (true) only immediately after tower auto-provisioned a brand-new account. */
  isNewAccount?: boolean
  iat: number
  exp: number
}
