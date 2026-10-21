---
title: "Story 002: Claims Enrichment Endpoint"
updated: 2026-08-03
status: draft
---
# Story 002 — Claims Enrichment Endpoint

**Epic:** Claims Enrichment
**Repo:** tower
**Status:** Draft
**New — tower's side of the contract [portcullis Story 010](../proxy/010-internal-jwt-generation.md)
already assumes exists.** Per [ADR 0001](../../adrs/0001-claims-enrichment-via-tower.md),
[ADR 0003](../../adrs/0003-enrichment-outcome-response-contract.md),
[ADR 0017](../../adrs/0017-account-identity-and-role-model.md),
[ADR 0018](../../adrs/0018-trial-roles-and-keep-boundary.md),
[ADR 0043](../../adrs/0043-application-reported-usage-metering.md).
**Sibling:** [Story 003](003-identity-resolution-at-login.md) covers the separate, explicit
login-time resolve-or-create call — kept as its own route rather than folded into this one, so
account creation is never an implicit side effect of the endpoint the auth gate hits on every
single request.

---

## Summary

`POST /enrich` is the live, per-request lookup portcullis calls on every authenticated request
(Story 010) — given a **single** identity hash for an **already-established** session, resolve
its account and return what portcullis needs to build the internal token. It never creates
anything; an established session's hash that resolves to nothing is treated as anomalous, not
as an implicit new signup.

This is the **one call in the entire design authenticated by SPIFFE mTLS alone** — no bearer
token (there's no operator involved), no internal JWT to independently verify (there isn't one
yet; this call is what produces the basis for one). Every other portcullis→tower route on this
surface (`POST /identity-links`, `POST /provider-discovery-status`) additionally verifies an
internal JWT where a session is involved — this one has no session yet at call time, by
definition.

---

## Request

```
POST /enrich
{
  tenant: '',        // resolved tenant slug (portcullis already resolved from Host)
  idp: '',
  identityHash: '',   // a single hash — the session's own, never a candidate list (Story 003 only)
  email: '',           // linking hint only, never authoritative (ADR 0001) — unused by this route today
  application: '',      // resolved application slug — scopes roles/usage (ADR 0017)
}
```

---

## Acceptance Criteria

### Identity resolution — lookup only, never resolve-or-create

- [ ] Look up the `identity` matching `identityHash` directly (no candidate list, no fallback
      generations to check — that reconciliation only ever happens at login, Story 003).
- [ ] **No match → `Deny`.** An established session's hash resolving to nothing is not treated
      as a new signup — that only happens through Story 003's explicit path. Two legitimate
      (non-bug) ways this can actually happen: the account's own identity was just unlinked by
      the user *of that same session* (structurally prevented for the currently-active identity
      specifically, ADR 0070's correction — but still possible if a *different* device's session
      is using an identity that gets unlinked from elsewhere), or a key-generation retention
      window was misconfigured shorter than the tenant's cookie `maxAge` (an operator error ADR
      0028 already named the invariant for). Either way, forcing re-authentication is the correct
      response, not silently fabricating a new account for what should be an established session.
- [ ] Fetch the matching `identity`, then `fetch('account', identity.state.accountId)` — two
      plain sequential lookups combined in this handler's own code, not a view actor (see tower
      Story 001's "No Separate View Actors" section for why a 1:1 relationship like this doesn't
      benefit from `aggregateFrom`).
- [ ] `email` is accepted on the request but not used for matching by this route at all — reserved
      for future linking-suggestion UX, never authorization (ADR 0001).

### Outcome

- [ ] Resolved `account.status === "suspended"` or `"deleted"` → `Deny` (`403`, `reason: "account
      locked"` or similar — server-side detail only, ADR 0003; the client-facing body is always
      generic).
- [ ] Otherwise → `Allow`:

```
{
  outcome: 'allow',
  accountId: '',
  grantedRoles: [],    // filtered to tenant-wide + this application's scope only (ADR 0017)
  trialRoles: [],       // same filtering; expiry is NOT evaluated here (ADR 0018 — portcullis
                          // does that, comparing trialExpiresAt against its own clock)
  trialExpiresAt: null,
  permissions: [],       // unfiltered — permissions are tenant-wide only, no per-application scope
  usage: [],              // account.usage (tower Story 001), filtered to this application
}
```

- [ ] `grantedRoles`/`trialRoles` are returned as **current plain state** — tower never
      evaluates `trialExpiresAt` itself; that comparison happens once, locally, in portcullis
      (ADR 0018) — this endpoint would otherwise be the only place in the whole design doing a
      clock comparison against data that's about to cross a network boundary anyway.
- [ ] `usage` is read directly from the fetched `account.usage` field (tower Story 001) and
      filtered to the request's `application` before response — no separate materialization step,
      it's already current on the actor itself.
- [ ] No `isNewAccount` field on this route's response at all — it genuinely cannot be true here
      (see Story 003 for where it actually applies).

### Auth

- [ ] SPIFFE mTLS only — the caller's service identity (portcullis) is the entire authorization
      check. No bearer token, no JWT of any kind is verified on this route.
- [ ] `tenant` in the request body is trusted as-is from the mTLS-authenticated caller — this
      route has no independent way to verify it beyond that, unlike tenant-scoped routes which
      check the caller's own resolved tenant against the URL.

---

## Notes

- This endpoint is the live dependency ADR 0001 originally worried about ("stale keep data flows
  through as stale claims... a hard dependency of this decision's correctness") — its own
  latency and availability directly become portcullis's per-request latency and availability
  for every protected route on every tenant. Tower's `Unreachable`-from-portcullis's-perspective
  case (timeout, connection refused) is entirely portcullis-side handling (Story 010's
  fail-open/fail-closed policy) — nothing in this story changes because of it; tower just needs
  to actually be fast and available, not implement anything special for that case itself.
- `Deny.reason`'s detail level is a server-side logging concern only (ADR 0003) — never
  returned in the response body beyond a generic `reason` string safe for the caller to log at
  its own discretion (portcullis logs it, never a client).
- Deliberately a **separate route** from Story 003 rather than one endpoint with a
  union-typed `identityHash: string | string[]` field — keeping "can this call create an
  account" a property of *which route was called*, visible at the routing layer, rather than a
  runtime branch buried in a conditional on request shape.
