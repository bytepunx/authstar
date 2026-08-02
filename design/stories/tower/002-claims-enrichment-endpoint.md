# Story 002 — Claims Enrichment Endpoint

**Epic:** Claims Enrichment
**Repo:** tower
**Status:** Draft
**New — tower's side of the contract [portcullis Story 010](../proxy/010-internal-jwt-generation.md)
and [Story 006](../proxy/006-oauth2-callback.md) already assume exists.** Per
[ADR 0001](../../decisions/0001-claims-enrichment-via-tower.md),
[ADR 0003](../../decisions/0003-enrichment-outcome-response-contract.md),
[ADR 0017](../../decisions/0017-account-identity-and-role-model.md),
[ADR 0018](../../decisions/0018-trial-roles-and-keep-boundary.md),
[ADR 0028](../../decisions/0028-identity-hash-key-generations.md),
[ADR 0043](../../decisions/0043-application-reported-usage-metering.md),
[ADR 0058](../../decisions/0058-analytics-event-shape-corrections.md).

---

## Summary

`POST /enrich` is the single endpoint behind both calls portcullis makes to tower: the
per-request claims lookup on every authenticated request (Story 010), and login-time identity
resolution (Story 006). Both are "given one or more candidate identity hashes, resolve the
canonical account and return what portcullis needs to build a token" — they differ only in
whether `identityHash` is a single string or an ordered array, and this story is deliberately
one endpoint handling both shapes rather than two separate ones, since nothing in how
portcullis actually calls it needs them to be different routes.

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
  tenant: '',                    // resolved tenant slug (portcullis already resolved from Host)
  idp: '',
  identityHash: '' | [''],       // single string: ordinary per-request. Ordered array,
                                  // current-generation first: login-time only (Story 006).
  email: '',                     // linking hint only, never authoritative (ADR 0001)
  application: '',                // resolved application slug — scopes roles/usage (ADR 0017)
}
```

---

## Acceptance Criteria

### Identity resolution

- [ ] **Single-string `identityHash`** (the ordinary per-request shape, Story 010): look up the
      matching `identity` record directly. **No account is created if it doesn't match anything**
      — an established session whose hash resolves to nothing is anomalous (possible tampering,
      not a legitimate new signup; a real new signup always arrives as the array shape below),
      and returns `Deny` rather than silently fabricating an account for it.
- [ ] **Array `identityHash`** (login-time only, Story 006): check each candidate **in order**
      against existing `identity` records; the first match wins.
  - [ ] If the match was against a **non-current-generation** candidate (anything but
        `identityHash[0]`), create an additional `identity` record keyed by the
        **current**-generation hash (`identityHash[0]`), pointing at the same `accountId` — this
        is the "alias the older hash forward" behavior ADR 0028 named but didn't spell out the
        mechanics of. Future logins converge on the current-generation hash directly without
        re-walking older generations.
  - [ ] If **no** candidate matches, create a new `account` (`status: active`, empty
        `grantedRoles`/`trialRoles`, `contactId` resolved/created the same deterministic way
        invite acceptance already does, ADR 0023) and a new `identity` keyed by
        `identityHash[0]`, pointing at it. Set `isNewAccount: true` on the response.
- [ ] `email` never participates in matching — used only as a linking *hint* elsewhere (self-
      service linking, ADR 0070, is the actual mechanism for attaching a second identity; this
      endpoint never merges accounts based on email similarity).

### Outcome

- [ ] Resolved `account.status === "suspended"` or `"deleted"` → `Deny` (`403`, `reason: "account
      locked"` or similar, server-side detail only per ADR 0003 — the client-facing body is
      always generic).
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
  usage: [],              // [{ application, meter, periodUsage, periodLimit }], filtered to
                            // this application, sourced from the enrichment view (ADR 0043)
  isNewAccount: false,     // true only via the array/login-time path above
}
```

- [ ] `grantedRoles`/`trialRoles` are returned as **current plain state** — tower never
      evaluates `trialExpiresAt` itself; that comparison happens once, locally, in portcullis
      (ADR 0018) — this endpoint would otherwise be the only place in the whole design doing a
      clock comparison against data that's about to cross a network boundary anyway.
- [ ] `usage` sourced from the enrichment view actor (Story 001's View Actors section) — already
      filtered to `application` before this response is built, no filtering logic duplicated at
      the HTTP layer.

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
- Not covered here: the enrichment *view actor*'s own construction (aggregating `identity` +
  `account` + keep's `entitlement.usage-updated` events into the state this endpoint reads) —
  see Story 001's View Actors section; this story is the HTTP surface over it, not the
  materialization itself.
