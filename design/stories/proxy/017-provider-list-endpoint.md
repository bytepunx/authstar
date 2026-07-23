# Story 017 — Provider List JSON Endpoint

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 017 — response shape unchanged; scope is now per-tenant.

---

## Summary

Portcullis exposes `GET /oauth2/providers` for the resolved tenant, returning a JSON array of
that tenant's configured, currently-available authentication providers.

---

## Acceptance Criteria

- [ ] `GET /oauth2/providers` is handled locally under the resolved tenant, on that tenant's
      exempt list (no authentication required).
- [ ] `200 OK`, `Content-Type: application/json`. Each entry:

  ```json
  { "id": "google", "name": "Google", "loginUrl": "/oauth2/google/login" }
  ```

  - `id` — the provider key as configured (lowercase).
  - `name` — the provider key with its first letter capitalised.
  - `loginUrl` — the provider's configured `loginPath`.

- [ ] Order matches `tenants.<slug>.providers`' insertion order.
- [ ] A provider that failed OIDC discovery for this tenant (Story 004's per-tenant isolation)
      is **omitted** from this response — it has no working login handler, so listing it would
      offer a dead link.
- [ ] If the tenant has no working providers (none configured, or all failed discovery), the
      endpoint returns an empty array `[]`.

---

## Notes

- Replaces the need for each adopting application to hard-code its own provider URLs —
  unchanged rationale from `ref-design`.
- A future `displayName` config override for the auto-capitalised `name` remains a possible
  enhancement, unchanged.
- Insertion-order-preserving structures remain required for the `providers` config, as noted in
  Story 001 — non-deterministic ordering here would be a regression.
