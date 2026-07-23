# Story 005 — OAuth2 Login Initiation

**Epic:** OAuth2 Authentication
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 005 — PKCE/state mechanics unchanged; provider/config
resolution is now application- and tenant-scoped (ADR 0016).

---

## Summary

When a user visits a provider's login path, portcullis redirects them to that provider's OAuth2
authorization endpoint with PKCE parameters, using the resolved application's own config plus
its owning tenant's shared provider credentials.

---

## Acceptance Criteria

- [ ] The application (and its owning tenant) have already been resolved (from `Host`, per
      Story 013) before this handler runs. `redirect_uri`'s base
      (`tenants.<slug>.applications.<appSlug>.server.publicUrl`) and cookie attributes
      (domain, path) come from tenant/application config as laid out in ADR 0016; the
      provider's `clientId`/`clientSecret`/`discoveryUrl`/`scope` come from the owning
      tenant's shared `providers` map, restricted to whichever providers this application
      exposes.
- [ ] Each provider the resolved application exposes registers a `GET` handler at its derived
      `loginPath` (default `/oauth2/{name}/login`) under that application.
- [ ] The handler generates a PKCE `code_verifier` (64 random bytes, base64url, no padding) and
      derives `code_challenge` via `BASE64URL(SHA256(ASCII(code_verifier)))` (S256, RFC 7636).
- [ ] The authorization URL is constructed with `response_type=code`, `client_id`,
      `redirect_uri = <application>.server.publicUrl + provider.callbackPath`, `scope`, a
      cryptographically random `state`, `code_challenge`, and `code_challenge_method=S256`.
- [ ] `state` is stored in an `oauth2-state` cookie and `code_verifier` in an
      `oauth2-pkce-verifier` cookie, both `httpOnly`, 300s `MaxAge`, `SameSite=Lax`, using the
      owning tenant's cookie `domain`/`path` (shared across the tenant's applications, ADR 0016).
- [ ] The handler responds `302 Found` to the authorization URL.

---

## Notes

- `state`/`code_verifier` must come from a cryptographically secure RNG (`rand::rngs::OsRng` or
  equivalent) — unchanged from `ref-design`.
- S256 only; `plain` is not implemented — unchanged from `ref-design`.
- A provider marked unavailable for this tenant (Story 004's per-tenant discovery failure), or
  simply not listed among an application's exposed providers, has no registered login handler
  under that application; a request to its `loginPath` is a plain 404, not a special error page.
- Since the OAuth `redirect_uri` is per-application but the provider credentials are shared at
  the tenant level, the operator must register every application's callback URL as an
  authorized redirect URI with the provider (e.g. in Google Cloud Console) — a normal,
  expected operational step, not something authstar automates.
