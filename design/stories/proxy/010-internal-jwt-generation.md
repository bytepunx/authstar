# Story 010 — Internal JWT Generation for Upstream Services

**Epic:** Session Management
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 010 per [ADR 0001](../../decisions/0001-claims-enrichment-via-tower.md),
[ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md),
[ADR 0003](../../decisions/0003-enrichment-outcome-response-contract.md).

---

## Summary

When a request is authenticated, portcullis calls tower's claims enricher, then — depending on
the outcome — signs a fresh, short-lived internal JWT (or rejects the request outright) and
forwards it as `Authorization: Bearer` to the upstream. The two-token model from `ref-design`
(long-lived session cookie, 60-second internal token, independent lifetimes) is unchanged; what
changes is everything that now determines the internal token's contents.

---

## Acceptance Criteria

### Keys

- [ ] Each tenant has its own ES256 **internal-token** signing keypair, distinct from its
      session keypair (Story 008) — per ADR 0002. Arrives as a signet secret named
      `tenant-<slug>-internal-key`.
- [ ] The internal token's JWT header carries a `kid`, same rotation model as the session
      token — but its overlap window can be much shorter, since a 60-second-lived token doesn't
      need the old key to remain valid for days the way a 7-day session cookie's key does.

### Enrichment call and the three-way outcome

- [ ] After successful session JWT verification (Story 009), portcullis calls tower's claims
      enricher with `{ idp, idp_sub, email }` (ADR 0001) and receives one of three outcomes:

  | Outcome | Behavior |
  |---|---|
  | `Allow(claims)` | Sign the internal token with the identity claims plus tower's returned claims merged in (claims cannot override `sub`/`iat`/`exp`). `enrichment_status: "ok"`. Forward. Unconditional — same on exempt and protected routes. |
  | `Deny{status, reason}` | **No internal token is generated.** On a **protected** route, the request is rejected immediately with `status`; `reason` is logged, never returned to the client (ADR 0003). Not forwarded upstream. On an **exempt** route, the request is instead forwarded with no `Authorization` header — identical to an anonymous request to that route (ADR 0015) — it is not rejected. |
  | `Unreachable(err)` | Fail-open: sign the internal token with **only** the bare identity claims (`sub`, `idp`, `idp_sub`) — no role/status/entitlement claims fabricated — and `enrichment_status: "degraded"`. Forward. Unconditional — same on exempt and protected routes. Fail-closed, **protected** route: reject (5xx), not forwarded. Fail-closed, **exempt** route: forward with no `Authorization` header, not rejected (ADR 0015). |

- [ ] `enrichment_status` (`"ok"` or `"degraded"`) is always present on a forwarded internal
      token — this is what lets an upstream application distinguish "tower said this user has
      no extra claims" from "tower was unreachable and we don't actually know" (ADR 0003).
      Applications must not treat `degraded` claims as authoritative.
- [ ] `exp` is set to 60 seconds from signing time, independent of the session token's
      `expiresIn` — unchanged from `ref-design`.
- [ ] The internal token is never set as a cookie and never sent to the browser — unchanged.
- [ ] Generated per-request; never cached or reused — unchanged.
- [ ] If no valid session cookie was found (unauthenticated request on an exempt route), no
      `Authorization` header is added and no enrichment call is made — unchanged from
      `ref-design`; enrichment only runs for requests that already have a verified session.

---

## Header Added to Upstream Request

```
Authorization: Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Notes

- The internal token's identity is the one upstream applications should trust — not the session
  cookie's `sub` — since tower resolves the canonical account from `(idp, idp_sub)` and returns
  it as part of the `Allow` outcome's claims (ADR 0001).
- Session and internal tokens now use separate keypairs per tenant (ADR 0002), superseding
  `ref-design`'s note that this was "a potential future hardening measure, out of scope" — it's
  in scope from the start here.
- Upstream services that forward the internal token to other internal services should not reuse
  it — unchanged guidance from `ref-design`.
