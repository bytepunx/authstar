---
title: "Story 017: Provider List JSON Endpoint"
updated: 2026-07-22
status: draft
---
# Story 017 — Provider List JSON Endpoint

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 017 — response shape unchanged; scope is now per-application
(ADR 0016) — an application lists the subset of its tenant's providers it exposes, not every
provider the tenant has credentials for.

---

## Summary

Portcullis exposes `GET /oauth2/providers` for the resolved application, returning a JSON array
of the providers that application exposes and are currently working.

---

## Acceptance Criteria

- [ ] `GET /oauth2/providers` is handled locally under the resolved application, on that
      application's exempt list (no authentication required).
- [ ] `200 OK`, `Content-Type: application/json`. Each entry:

  ```json
  { "id": "google", "name": "Google", "loginUrl": "/oauth2/google/login" }
  ```

  - `id` — the provider key as configured (lowercase).
  - `name` — the provider key with its first letter capitalised.
  - `loginUrl` — the provider's configured `loginPath`, under this application.

- [ ] Order matches the application's configured provider-exposure list (ADR 0016), which
      references — but is not required to include all of — the owning tenant's `providers` map.
- [ ] A provider that failed OIDC discovery for the owning tenant (Story 004's per-tenant
      isolation), or that this application doesn't expose, is **omitted** from this response —
      it has no working login handler under this application, so listing it would offer a dead
      link.
- [ ] If the application has no working exposed providers, the endpoint returns an empty array
      `[]`.

---

## Notes

- Replaces the need for each adopting application to hard-code its own provider URLs —
  unchanged rationale from `ref-design`.
- A future `displayName` config override for the auto-capitalised `name` remains a possible
  enhancement, unchanged.
- Insertion-order-preserving structures remain required for the `providers` config, as noted in
  Story 001 — non-deterministic ordering here would be a regression.
