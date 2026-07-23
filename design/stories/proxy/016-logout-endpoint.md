# Story 016 — Logout Endpoint

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 016 — mechanics unchanged; cookie attributes now
tenant-scoped.

---

## Summary

Portcullis exposes `GET /oauth2/logout`, which clears the resolved tenant's session cookie and
redirects to the home page.

---

## Acceptance Criteria

- [ ] `GET /oauth2/logout` is handled locally (not proxied upstream), under the resolved
      tenant.
- [ ] The handler clears the `jwt` cookie by setting `Max-Age: 0` and an `Expires` in the past,
      using the same `Path` and `Domain` the resolved tenant issued it with (Story 008), so the
      browser actually removes it.
- [ ] After clearing, the handler redirects to `/` with `302 Found`.
- [ ] Accessible without authentication — works even with an invalid or expired JWT, since
      there's nothing to validate to log out.
- [ ] No server-side session state is invalidated — JWTs remain stateless. Immediate,
      server-enforced revocation of an already-issued session is the open research item tracked
      in ADR 0001 (per-session revocation via a `jti` + revocation set), not something this
      endpoint does.

---

## Notes

- This is a known, accepted trade-off carried over from `ref-design`: a compromised token
  remains valid until its natural expiry or until a `Deny` catches it on the next authenticated
  request (ADR 0001/0003) — logout alone doesn't force that.
- A configurable post-logout redirect (rather than hardcoded `/`) remains a potential future
  enhancement, unchanged from `ref-design`.
