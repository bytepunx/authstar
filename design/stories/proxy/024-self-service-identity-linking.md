---
title: "Story 024: Self-Service Identity Linking"
updated: 2026-08-01
status: draft
---
# Story 024 — Self-Service Identity Linking

**Epic:** OAuth2 Authentication
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0070](../../adrs/0070-self-service-identity-linking.md).

---

## Summary

An already-authenticated user can link an additional OIDC identity to their existing account.
Reuses Story 005/006's redirect and callback mechanics almost entirely, branching only at two
points: initiation requires an existing session, and the callback defers the actual write behind
an explicit confirmation step rather than committing immediately.

---

## Acceptance Criteria

### Initiation — `GET /oauth2/{name}/link`

- [ ] Registered per-application, per-provider, alongside `/oauth2/{name}/login` (Story 005),
      for each provider the resolved application exposes.
- [ ] **Protected**, not exempt — an unauthenticated visitor is redirected to normal login by
      the existing auth gate (Story 013); no special handling needed here for that case.
- [ ] Identical to Story 005's login-initiation handler (PKCE generation, `state`/
      `oauth2-pkce-verifier` cookies, `302` to the provider) with one addition: also sets an
      `oauth2-link-mode` cookie, `httpOnly`, `SameSite=Lax`, same 300s `MaxAge` and tenant
      `domain`/`path` scoping as the other flow cookies.

### Callback branch — `/oauth2/{name}/callback`, when `oauth2-link-mode` is present

- [ ] `oauth2-link-mode` is read and cleared immediately, same discipline as `oauth2-state`/
      `oauth2-pkce-verifier` (Story 006).
- [ ] State/PKCE validation, code exchange, userinfo fetch, and `identityHash` computation are
      **identical** to Story 006's ordinary path — no divergence before this point.
- [ ] **The current session JWT is re-verified as still valid**, and `accountId` is read from
      it — never from anything set during initiation. If the session is missing or invalid at
      this point, the attempt is aborted with a generic error page; **this path never falls
      through to Story 006's ordinary resolve-or-create identity resolution.**
- [ ] On success, the handler does **not** call tower yet. It sets an `oauth2-pending-link`
      cookie (`httpOnly`, `SameSite=Lax`, short `MaxAge`, same tenant scoping) carrying
      `{ identityHash, idp }`, and redirects (`302`) to `/_authstar/link/confirm`.

### Confirmation — `/_authstar/link/confirm`

- [ ] `GET /_authstar/link/confirm` is proxied to `web` per [Story 023](023-branded-page-proxying.md)
      (protected, forwarded internal JWT, `idp` name attached as a request header read from the
      `oauth2-pending-link` cookie). `web` renders a tenant-branded "Link your {idp} account?"
      confirmation with Confirm/Cancel actions.
- [ ] `POST /_authstar/link/confirm` is **portcullis-owned**, not proxied. On Confirm:
      - Reads `identityHash`/`idp` **only** from the `oauth2-pending-link` cookie — the request
        body is never trusted for these values, preventing a tampered client from linking an
        identity other than the one just actually authenticated.
      - Re-derives `accountId` from the current session JWT, same as the callback step.
      - Calls tower's `POST /identity-links` (SPIFFE mTLS, ADR 0030's portcullis-mTLS surface)
        with `{ tenant, accountId, identityHash, idp }`.
      - Clears the `oauth2-pending-link` cookie regardless of tower's response.
      - `201`/idempotent-success from tower → redirect to a success page (or back to the
        referring application, if a return URL was captured — reuses Story 007's return-URL
        mechanism). `409` from tower → redirect to the confirm page's error state ("this sign-in
        is already linked to a different account"); no retry loop, no account merge.
- [ ] On Cancel: portcullis clears the `oauth2-pending-link` cookie and redirects back to the
      referring application. No tower call is made.

---

## Error Handling

| Scenario | Response |
|----------|----------|
| `/oauth2/{name}/link` visited without a valid session | Redirect to login (Story 013's normal unauthenticated handling) |
| Session invalid at the linking callback | Generic error page; no account created, no identity created |
| `oauth2-pending-link` cookie missing at `POST /_authstar/link/confirm` | `400 Bad Request` — nothing to confirm |
| Tower returns `409` (identityHash belongs to a different account) | Confirm page's error state; no merge attempted |

---

## Notes

- Deliberately reuses Story 005/006's mechanics wholesale rather than a parallel implementation
  — the only genuinely new behavior is the session re-verification, the deferred-write/
  confirmation step, and the pending-link cookie.
- The confirmation step exists specifically to mitigate a CSRF-forced-navigation risk on the
  bare `GET` redirect that starts this flow — see ADR 0070's Context for the full reasoning.
  It's cheap insurance, not a response to an exploit anyone has demonstrated against this design.
- No new fallback-if-`web`-unreachable behavior is invented — `/_authstar/link/confirm`'s `GET`
  follows Story 023's `/_authstar/upgrade` precedent (no fallback, ordinary `502`/`504`).
