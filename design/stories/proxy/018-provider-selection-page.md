# Story 018 — Multi-Provider Selection Page

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 018 — unchanged; scope is now per-tenant.

---

## Summary

When a tenant has more than one working authentication provider and its `auth.loginUrl`
resolves to `/oauth2/select`, portcullis serves a minimal HTML page listing that tenant's
providers.

---

## Acceptance Criteria

- [ ] `GET /oauth2/select` is registered under a tenant when that tenant's
      `tenants.<slug>.auth.loginUrl` is `/oauth2/select` — the default when 2+ *working*
      providers are configured for that tenant (a provider that failed discovery, per Story
      004, doesn't count toward this threshold and is not listed).
- [ ] On that tenant's exempt list.
- [ ] `200 OK`, `Content-Type: text/html`, one `<a>` per working provider, pointing at that
      provider's `loginPath`, link text the same capitalised display name as Story 017.
- [ ] Functional without JavaScript.
- [ ] If a tenant has only one working provider, its `auth.loginUrl` defaults directly to that
      provider's `loginPath` and `/oauth2/select` is not registered for that tenant.

---

## Notes

- Intentionally minimal — operators are expected to build their own login UI against
  `/oauth2/providers` (Story 017), unchanged from `ref-design`.
- A configurable redirect to an operator-supplied custom login page remains a possible future
  enhancement, unchanged.
