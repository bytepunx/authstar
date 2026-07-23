# Story 009 — JWT Verification on Incoming Requests

**Epic:** Session Management
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 009 per [ADR 0001](../../decisions/0001-claims-enrichment-via-tower.md),
[ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md).

---

## Summary

Before forwarding any protected request upstream, portcullis validates the session JWT cookie
against the *resolved tenant's* session public key, and extracts the identity fields the claims
enricher needs.

---

## Acceptance Criteria

- [ ] Application (and owning tenant) resolution (from `Host`, Story 013, ADR 0016) happens
      **before** this step — verification cannot proceed without knowing which tenant's key(s)
      to check against. A request whose `Host` matches no configured application never reaches
      JWT verification at all (see Story 013).
- [ ] For every incoming request (post tenant-resolution), portcullis looks for the `jwt`
      cookie.
- [ ] If found, the token's `kid` header is used to select the matching public key from the
      resolved tenant's key set (current key, plus any key still within its rotation overlap
      window — Story 008). A `kid` with no match for this tenant is treated as verification
      failure.
- [ ] Verification checks, against the selected key:
      - Signature is valid.
      - `iss` claim matches `tenants.<slug>.jwt.issuer`.
      - `aud` claim matches `tenants.<slug>.jwt.audience`.
      - Token is not expired (`exp` > current time, with a small clock-skew leeway, e.g. 30s).
- [ ] On success, `sub`, `idp`, and `idp_sub` are stored on the request context for downstream
      use — not just `sub` as in the original reference, since `idp`/`idp_sub` are what the
      claims enricher (ADR 0001) sends to tower for identity resolution.
- [ ] On failure (any check above, including an unmatched `kid`), the JWT is treated as absent —
      the request flows to the unauthenticated handling logic (Story 013/014). Errors are
      logged at debug level and never returned to the client.
- [ ] Verification order relative to the rest of the gate is unchanged from `ref-design`:
      1. Attempt JWT verification (if cookie present, against the resolved tenant's keys).
      2. Check if the route is exempt (resolved application's exempt list — Story 003).
      3. Decide the authentication outcome (Story 013).

---

## Notes

- The resolved tenant's public keys are held in memory as part of portcullis's single bundle
  (Story 001) — no per-request signet call is made to verify a session JWT.
- Rejecting invalid/expired tokens silently (no 401 at this stage) is intentional, unchanged
  from `ref-design` — the auth gate (Story 013) makes the final call, now including the
  three-way enrichment outcome from ADR 0001/0003.
