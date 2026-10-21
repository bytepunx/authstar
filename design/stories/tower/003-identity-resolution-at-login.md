---
title: "Story 003: Identity Resolution at Login"
updated: 2026-08-05
status: draft
---
# Story 003 — Identity Resolution at Login

**Epic:** Claims Enrichment
**Repo:** tower
**Status:** Draft
**New — tower's side of the contract [portcullis Story 006](../proxy/006-oauth2-callback.md)
already assumes exists.** Per [ADR 0001](../../adrs/0001-claims-enrichment-via-tower.md),
[ADR 0017](../../adrs/0017-account-identity-and-role-model.md),
[ADR 0023](../../adrs/0023-pii-isolation-via-hashed-contact-records.md),
[ADR 0027](../../adrs/0027-portcullis-computed-identity-hash.md),
[ADR 0028](../../adrs/0028-identity-hash-key-generations.md),
[ADR 0058](../../adrs/0058-analytics-event-shape-corrections.md).
**Sibling:** [Story 002](002-claims-enrichment-endpoint.md) is the separate, ordinary
per-request lookup — kept apart so account creation only ever happens through this explicit,
narrowly-scoped route, never as an implicit branch inside the endpoint hit on every request.

---

## Summary

`POST /identities/resolve` is called **only** at login (Story 006), never on ordinary requests.
Given an ordered list of candidate identity hashes (current key generation first), it resolves
the canonical account — creating one if genuinely nothing matches — and tells portcullis whether
this was a brand-new account.

This call also carries an optional `redeem` field for invite/invite-code redemption —
[Story 007](007-invites-and-invite-codes.md) owns that field's full shape and behavior; it's
folded into this same call (rather than a separate one) so a new account and its invite-granted
roles apply atomically, from portcullis's perspective, in one round trip.

---

## Request

```
POST /identities/resolve
{
  tenant: '', idp: '',
  identityHashes: [''],   // ordered, current-generation first — always an array, even if length 1
  email: '',                // linking hint only, never authoritative (ADR 0001)
}
```

No `application` field — unlike `/enrich`, this call precedes any role/usage scoping; the
session it produces is what later `/enrich` calls will scope per-application.

---

## Acceptance Criteria

### Resolution

- [ ] Check each candidate **in order** against existing `identity` records; the first match
      wins.
- [ ] **Match against a non-current-generation candidate** (anything but `identityHashes[0]`):
      create an additional `identity` record keyed by the **current**-generation hash
      (`identityHashes[0]`), pointing at the same `accountId` — the "alias the older hash
      forward" behavior ADR 0028 named but never detailed the mechanics of. Future logins
      converge on the current-generation hash directly, without re-walking older generations.
- [ ] **No candidate matches**: create a new `account` (`status: "active"`, empty
      `grantedRoles`/`trialRoles`, `usage: []`) and a new `identity` keyed by
      `identityHashes[0]`, pointing at it. `contactId` is resolved/created via the same
      deterministic HMAC lookup invite acceptance already uses (ADR 0023) — "created-or-reused,"
      never a fresh row for an email that already has one under this tenant.
- [ ] `email` never participates in matching, at creation or otherwise — a hint only, per ADR
      0001; this route does not attempt account-linking-by-email-similarity under any
      circumstance (that's ADR 0070's self-service linking, a distinct, explicit, user-confirmed
      action).

### Response

```
{
  accountId: '',
  isNewAccount: false,   // true only when no candidate matched and a new account was created
}
```

- [ ] `isNewAccount: true` exactly once per account, on the call that actually created it — never
      recomputed or re-derived later. Portcullis uses this to dispatch
      `analytics.auth.signup-completed` (ADR 0058) — consumed for that purpose only, this
      endpoint has no other caller that needs it.
- [ ] No `Deny` outcome exists on this route — unlike `/enrich`, there is no "account locked"
      check here. A suspended/deleted account can still be *resolved* by this call (the session
      it produces will simply fail every subsequent `/enrich` call once formed) — login-time
      resolution and per-request authorization are deliberately kept separate concerns, not
      merged into one check performed twice.

### Auth

- [ ] SPIFFE mTLS only, identical posture to `/enrich` (Story 002) — same trust boundary, same
      reasoning: no session exists yet at call time, so nothing beyond the caller's own service
      identity can be checked.

---

## Notes

- `identityHashes` is always an array, even for the (common) case where portcullis only has one
  generation to check — no single-vs-array ambiguity at the wire level, unlike the earlier
  single-endpoint design this story replaces.
- This route's account-creation side effect is exactly what makes it worth keeping structurally
  separate from Story 002: a reviewer or implementer scanning tower's route table sees "this one
  can create accounts, that one can't" without needing to read a conditional inside a handler.
- Not covered here: what happens to `identity`/`account` records on GDPR erasure (ADR 0026) —
  erasure acts on `contact`, and neither `identity` nor `account` is deleted by it; a repeat
  login for an erased contact resolves the *same* account (via the existing `identity` record,
  untouched by erasure) with a fresh, deterministically-recreated `contact` row. Not a gap this
  story introduces — flagged here only because it's adjacent, not because it needs solving here.
