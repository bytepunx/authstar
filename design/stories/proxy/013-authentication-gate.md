# Story 013 — Authentication Gate (Pre-Handler)

**Epic:** Reverse Proxy
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 013 — substantially expanded per
[ADR 0001](../../decisions/0001-claims-enrichment-via-tower.md),
[ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md),
[ADR 0003](../../decisions/0003-enrichment-outcome-response-contract.md),
[ADR 0014](../../decisions/0014-single-bundle-prefixed-tenant-keys.md),
[ADR 0015](../../decisions/0015-exempt-routes-never-blocked.md).

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
                                    Yes│                              No│
                                       ▼                                ▼
                          Call tower's claims enricher          Is route exempt for
                          (Story 010)                           this tenant? (Story 003)
                                       │                                │
                        ┌──────────────┼──────────────┐             Yes│    No│
                        ▼              ▼               ▼                ▼      ▼
                     Allow      Unreachable          Deny            Forward  Is browser?
                        │        │        │             │            (no auth  (Story 014)
                        ▼    fail-open fail-closed  Is route exempt?  header)     │
                  Sign internal │        │           │        │                Yes│    No│
                  token, "ok".  ▼        ▼        Yes│     No │                   ▼      ▼
                  Forward.  Sign token  Is route     ▼        ▼                 Save    Return
                            "degraded"  exempt?   Forward  Reject: tower's     return   401 JSON
                            Forward.    │    │    (no auth  status, reason     URL,     (Story 015)
                                     Yes│ No │     header)  logged not         redirect
                                        ▼    ▼    (ADR 0015) exposed          to login
                                    Forward Reject           (Story 015)      (Story 007)
                                    (no auth (503)
                                    header)  (Story 015)
                                    (ADR 0015)
```

Route exemption can only ever turn a would-be rejection into a pass-through (forwarded, no
`Authorization` header) — it never turns a pass-through into a rejection, and the enrichment
call itself always runs when a valid session exists, exempt or not (ADR 0015).

---

## Acceptance Criteria

- [ ] Tenant resolution runs first, before any other step, for every request. A `Host` matching
      no entry in the `tenants` map is rejected (`404`) before touching JWT verification,
      exemption, or enrichment.
- [ ] The gate runs as middleware applied to every route handler before proxying.
- [ ] A request with a **valid session JWT** for the resolved tenant always triggers the claims
      enrichment call and its three-way outcome — regardless of whether the route is exempt.
      - `Allow` → sign the internal token (`enrichment_status: "ok"`, Story 010), forward with
        `Authorization` header (Story 011). **Unconditional — same on exempt and protected
        routes.**
      - `Unreachable`, fail-open → sign the internal token carrying only bare identity claims
        and `enrichment_status: "degraded"`, forward. **Unconditional — same on exempt and
        protected routes.**
      - `Deny`, or `Unreachable` under fail-closed → on a **protected** route, reject
        immediately (tower's specified status for `Deny`, `503` for fail-closed
        `Unreachable`); the reason/error is logged, never returned to the client (ADR 0003,
        Story 015); not forwarded. On an **exempt** route, the request is **not** rejected — it
        is forwarded without an `Authorization` header, identical to how an anonymous request
        to that route is handled (ADR 0015).
- [ ] A request **without** a valid session JWT on an **exempt route** proceeds without an
      `Authorization` header — no enrichment call is made (there's no session to enrich).
- [ ] A request **without** a valid session JWT on a **protected route** triggers the
      unauthenticated handling logic: browser → save return URL + redirect (Story 007); API
      client → `401` JSON (Story 015), per the browser/API detection in Story 014.
- [ ] The gate is the only place authentication and authorization decisions are made — no
      per-route auth logic elsewhere.
- [ ] No response the gate returns for a `Deny` or fail-closed `Unreachable` outcome is ever
      produced for a request to an exempt route (ADR 0015) — outright rejection is reserved for
      protected routes only.

---

## Notes

- "Valid JWT" means verified per Story 009 (correct signature against the resolved tenant's
  key, correct issuer/audience, not expired). The gate does not differentiate between an absent
  cookie and an invalid/expired one — both are "no valid JWT," unchanged from `ref-design`.
- Exempt routes are public-facing by definition — an anonymous visitor is always let through.
  A visitor carrying a *denied* session must never end up worse off than that anonymous
  visitor purely for having once authenticated; ADR 0015 exists specifically to prevent that.
  The enrichment call still runs on exempt routes (so a valid, allowed session can still
  opportunistically attach identity for the upstream to use), but its outcome can only add
  identity to the forwarded request, never take the request away.
