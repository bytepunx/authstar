# Story 005 — OAuth2 Login Initiation

**Epic:** OAuth2 Authentication
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 005 — PKCE/state mechanics unchanged; provider/config
resolution is now tenant-scoped.

---

## Summary

When a user visits a provider's login path, portcullis redirects them to that provider's OAuth2
authorization endpoint with PKCE parameters, using the config resolved for the tenant the
request's `Host` header maps to.

---

## Acceptance Criteria

- [ ] The tenant has already been resolved (from `Host`, per Story 013) before this handler
      runs; the provider config, `redirect_uri` base (`tenants.<slug>.server.publicUrl`), and
      cookie attributes (domain, path) used below all come from that tenant's section of the
      bundle, not global config.
- [ ] Each configured provider registers a `GET` handler at its derived `loginPath` (default
      `/oauth2/{name}/login`) under the resolved tenant.
- [ ] The handler generates a PKCE `code_verifier` (64 random bytes, base64url, no padding) and
      derives `code_challenge` via `BASE64URL(SHA256(ASCII(code_verifier)))` (S256, RFC 7636).
- [ ] The authorization URL is constructed with `response_type=code`, `client_id`,
      `redirect_uri = tenants.<slug>.server.publicUrl + provider.callbackPath`, `scope`, a
      cryptographically random `state`, `code_challenge`, and `code_challenge_method=S256`.
- [ ] `state` is stored in an `oauth2-state` cookie and `code_verifier` in an
      `oauth2-pkce-verifier` cookie, both `httpOnly`, 300s `MaxAge`, `SameSite=Lax`, using the
      resolved tenant's cookie `domain`/`path`.
- [ ] The handler responds `302 Found` to the authorization URL.

---

## Notes

- `state`/`code_verifier` must come from a cryptographically secure RNG (`rand::rngs::OsRng` or
  equivalent) — unchanged from `ref-design`.
- S256 only; `plain` is not implemented — unchanged from `ref-design`.
- A provider marked unavailable for this tenant (Story 004's per-tenant discovery failure) has
  no registered login handler; a request to its `loginPath` is a plain 404, not a special error
  page.
