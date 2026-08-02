# Story 018 — Multi-Provider Selection Page

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 018 — unchanged; scope is now per-application (ADR 0016).
**Fallback-only in practice**: `auth.loginUrl`'s real computed default now points at `_portal`'s
hosted, tenant-branded login page (ADR 0050/0064), not this built-in page — this story's page is
reached only if an operator explicitly overrides `auth.loginUrl` back to `/oauth2/select`.

---

## Summary

When an application exposes more than one working authentication provider and its
`auth.loginUrl` resolves to `/oauth2/select`, portcullis serves a minimal HTML page listing
that application's providers.

---

## Acceptance Criteria

- [ ] `GET /oauth2/select` is registered under an application when that application's
      `auth.loginUrl` is `/oauth2/select` — the default when 2+ *working* providers are exposed
      by that application (a provider that failed discovery, per Story 004, or that the
      application doesn't expose, doesn't count toward this threshold and is not listed).
- [ ] On that application's exempt list.
- [ ] `200 OK`, `Content-Type: text/html`, one `<a>` per working provider, pointing at that
      provider's `loginPath` under this application, link text the same capitalised display
      name as Story 017.
- [ ] Functional without JavaScript.
- [ ] If an application exposes only one working provider, its `auth.loginUrl` defaults
      directly to that provider's `loginPath` and `/oauth2/select` is not registered for that
      application.

---

## Notes

- Intentionally minimal — operators are expected to build their own login UI against
  `/oauth2/providers` (Story 017), unchanged from `ref-design`.
- A configurable redirect to an operator-supplied custom login page remains a possible future
  enhancement, unchanged.
