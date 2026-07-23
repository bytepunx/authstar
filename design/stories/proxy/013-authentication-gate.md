# Story 013 — Authentication Gate (Pre-Handler)

**Epic:** Reverse Proxy
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 013 — substantially expanded per
[ADR 0001](../../decisions/0001-claims-enrichment-via-tower.md),
[ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md),
[ADR 0003](../../decisions/0003-enrichment-outcome-response-contract.md),
[ADR 0014](../../decisions/0014-single-bundle-prefixed-tenant-keys.md).

---

## Summary

Every request passes through an authentication gate before being proxied. The gate resolves the
tenant, verifies the session, calls tower's claims enricher, and decides whether to forward the
request (with or without auth headers), redirect to login, or reject it. This is the single
enforcement point for all authentication and authorization policy.

---

## Decision Flow

```
Incoming Request
      │
      ▼
Resolve tenant from Host header (Story 001's `tenants` map)
      │
   No match                          Match
      │                                │
      ▼                                ▼
404 (no tenant for this host)   JWT cookie present and valid
                                 for this tenant? (Story 009)
                                       │
                                    Yes│                    No│
                                       ▼                      ▼
                          Call tower's claims enricher    Is route exempt for
                          (Story 010)                     this tenant? (Story 003)
                                       │                      │
                        ┌──────────────┼──────────────┐   Yes│        No│
                        ▼              ▼               ▼      ▼          ▼
                     Allow          Deny          Unreachable Forward  Is browser?
                        │              │               │      (no auth  (Story 014)
                        ▼              ▼           ┌────┴───┐  header)     │
                  Sign internal   Reject with    fail-open  fail-closed  Yes│    No│
                  token, status   tower's        │            │            ▼      ▼
                  "ok". Forward.  status;         Sign internal  Reject   Save    Return
                                  reason logged,   token, status  (5xx)   return  401 JSON
                                  not exposed      "degraded"              URL,   (Story 015)
                                  (Story 015).      (identity-only         redirect
                                  Not forwarded.     claims). Forward.     to login
                                                                           (Story 007)
```

---

## Acceptance Criteria

- [ ] Tenant resolution runs first, before any other step, for every request. A `Host` matching
      no entry in the `tenants` map is rejected (`404`) before touching JWT verification,
      exemption, or enrichment.
- [ ] The gate runs as middleware applied to every route handler before proxying.
- [ ] A request with a **valid session JWT** for the resolved tenant always triggers the claims
      enrichment call and its three-way outcome, **regardless of whether the route is
      exempt** — an exempt route does not bypass a `Deny` (e.g. a locked account must not reach
      an exempt upstream just because the route itself needs no auth to *reach*).
      - `Allow` → sign the internal token (`enrichment_status: "ok"`, Story 010), forward with
        `Authorization` header (Story 011).
      - `Deny` → reject immediately with tower's specified status; the reason is logged, never
        returned to the client (ADR 0003, Story 015). Not forwarded upstream.
      - `Unreachable` → the tenant's configured fail-open/fail-closed policy decides: fail-open
        signs an internal token carrying only bare identity claims and
        `enrichment_status: "degraded"` and forwards; fail-closed rejects (5xx). Neither variant
        fabricates role/status claims.
- [ ] A request **without** a valid session JWT on an **exempt route** proceeds without an
      `Authorization` header — no enrichment call is made (there's no session to enrich).
- [ ] A request **without** a valid session JWT on a **protected route** triggers the
      unauthenticated handling logic: browser → save return URL + redirect (Story 007); API
      client → `401` JSON (Story 015), per the browser/API detection in Story 014.
- [ ] The gate is the only place authentication and authorization decisions are made — no
      per-route auth logic elsewhere.

---

## Notes

- "Valid JWT" means verified per Story 009 (correct signature against the resolved tenant's
  key, correct issuer/audience, not expired). The gate does not differentiate between an absent
  cookie and an invalid/expired one — both are "no valid JWT," unchanged from `ref-design`.
- The opportunistic behavior — an authenticated request gets the auth treatment (including
  potential `Deny`) even on an exempt route — is a deliberate strengthening over `ref-design`'s
  original framing ("upstream services on exempt routes can optionally use the identity if
  present"): now that enrichment can produce a `Deny`, exemption from *requiring* auth must not
  become exemption from an account-status check that's already available.
