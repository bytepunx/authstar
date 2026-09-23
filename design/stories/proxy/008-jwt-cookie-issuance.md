# Story 008 — JWT Session Cookie Issuance

**Epic:** Session Management
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 008 per [ADR 0001](../../decisions/0001-claims-enrichment-via-tower.md),
[ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md),
[ADR 0014](../../decisions/0014-single-bundle-prefixed-tenant-keys.md),
[ADR 0027](../../decisions/0027-portcullis-computed-identity-hash.md).

---

## Summary

After a user authenticates via OAuth2, portcullis signs a JWT with the resolved tenant's own
session-signing key and stores it in an `httpOnly` cookie. This cookie is the user's session
for all subsequent requests to that tenant through portcullis.

---

## Acceptance Criteria

### Keys

- [ ] Each tenant has its own ES256 (ECDSA P-256) **session** signing keypair, distinct from
      its internal-token keypair (Story 010) — per ADR 0002. Both arrive as secrets in
      portcullis's single signet bundle (Story 001), named `tenant-<slug>-session-key` — there
      are no `jwt.private`/`jwt.public` file-path config fields; nothing is read from disk.
- [ ] Each signing key carries a `kid` (key id). The JWT header's `kid` identifies which key
      signed it, supporting rotation with an overlap window (Story 009 verifies against the
      current key plus any still-valid recently-rotated key for that tenant).
- [ ] A tenant with a missing or invalid session key is unable to issue sessions — this is a
      per-tenant failure (that tenant's login is broken) and must not affect any other tenant,
      consistent with Story 004's per-tenant isolation posture.
- [ ] Each tenant also has an `identity-hash-key` secret (ADR 0027) — distinct from the signing
      keypairs above, used only for the HMAC computed in Story 006. **This key is never given
      to tower** — it exists solely so portcullis can compute `identityHash` and, later, verify
      the claim came from a value it could have produced itself.

### Claims

- [ ] After a successful userinfo fetch (Story 006), portcullis signs a JWT with:

  | Claim | Value |
  |-------|-------|
  | `sub` | User's email address |
  | `idp` | The provider name used to authenticate (e.g. `google`) |
  | `identityHash` | The HMAC computed in Story 006 from the provider's subject identifier — never the raw value itself (ADR 0027) |
  | `iss` | The resolved tenant's `tenants.<slug>.jwt.issuer` |
  | `aud` | The resolved tenant's `tenants.<slug>.jwt.audience` |
  | `iat` | Current Unix timestamp |
  | `exp` | `iat + tenants.<slug>.jwt.expiresIn` (duration string, e.g. `168h`) |

- [ ] `issuer`, `audience`, and `expiresIn` remain plain (non-secret) per-tenant config values —
      only the key *material* moved to signet secrets; these three stay ordinary config fields.
- [ ] The duration string format for `expiresIn` supports at minimum `Xs`/`Xm`/`Xh`/`Xd`.

### Cookie

- [ ] The signed JWT is set as a cookie named `jwt` with attributes sourced from the resolved
      tenant's config:

  | Attribute | Source |
  |-----------|--------|
  | `HttpOnly` | `tenants.<slug>.cookie.httpOnly` |
  | `Path` | `tenants.<slug>.cookie.path` |
  | `Domain` | `tenants.<slug>.cookie.domain` |
  | `Max-Age` | `tenants.<slug>.cookie.maxAge` |
  | `Secure` | `tenants.<slug>.cookie.secure` |
  | `SameSite` | `Lax` (hardcoded — cross-site OAuth2 flows require at least Lax) |

---

## Notes

- `sub = email` is retained rather than switching to a composite identifier — per the explicit
  decision in the ADR 0001 discussion: email stays human-readable for logging/debugging, while
  `idp`/`identityHash` carry the actual identity-resolution key tower uses. The session
  cookie's identity is not what upstream applications should trust; the internal token's
  resolved identity (Story 010) is.
- The raw provider subject identifier (`sub` from userinfo — not this token's own `sub` claim,
  which is email) never reaches this cookie at all, per ADR 0027 — only its hash does. This
  shrinks its exposure window to portcullis's own process memory during Story 006, rather than
  sitting in a browser-held cookie for the life of the session.
- The private key must never be logged, matching the reference's original constraint — now
  extended to mean "never logged at any point after being received from signet," since it's no
  longer a file on disk at all.
