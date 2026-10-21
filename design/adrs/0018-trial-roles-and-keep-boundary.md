---
id: ADR-0018
title: Trial Roles via Granted/Trial Split; Keep Stays Behind Web, Not Tower
status: accepted
date: 2026-07-24
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0018: Trial Roles via Granted/Trial Split; Keep Stays Behind Web, Not Tower

- **Status:** Accepted
- **Date:** 2026-07-24
- **Affects:** tower, portcullis, keep, web

## Context

Extending ADR 0017's role model to support time-boxed trial entitlements (org-level and
individual/B2C) surfaced two design questions: how admin-initiated trial actions (extend,
reissue, convert to paid) reach keep without compromising the one-directional keep→tower async
pattern ADR 0001/0006 established, and how expiry-aware role logic can stay out of tower's
materialized view without pushing complexity into the hot enrichment path.

## Decision

Keep is reached through `web`, never through `tower`.

### Keep is reached through `web`, never through `tower`

Admin-initiated entitlement/trial actions (extend a trial, issue a new one, convert to paid)
go **`web` → `keep` directly**, not through tower. Tower's relationship to keep remains exactly
what ADR 0001/0006 established: one-directional, async, keep publishes and tower materializes —
no exception, no new synchronous channel. This is a simplification over an earlier proposal
(a narrow tower→keep admin-command call) that turned out to be unnecessary once `web` can talk
to keep on its own for the domain keep actually owns.

### Roles split into `grantedRoles` and `trialRoles`, with a plain `trialExpiresAt`

Rather than tower computing "is this expired" and deciding what to return, tower's materialized
account/identity view (ADR 0017's view actor) carries three plain fields, updated by whatever
events touch them — including trial-grant/trial-extend events arriving from keep via the
existing async path — with **no conditional or time-aware logic anywhere in tower**:

```ts
{
  accountId,
  status,
  grantedRoles: [ { name, scope } ],   // permanent -- always in effect
  trialRoles: [ { name, scope } ],      // time-boxed -- only in effect before expiry
  trialExpiresAt: null,                  // timestamp, or null if no active trial
}
```

Tower's enrichment endpoint (`Allow` outcome) returns these three fields **unconditionally, as
current state** — it never compares `trialExpiresAt` against "now" itself. This keeps both the
view materialization and the enrichment response trivially simple: a single-key read, no
business rules baked into either.

### Portcullis does the merge, at internal-token construction time

The only place `now < trialExpiresAt` gets evaluated is in portcullis, when constructing the
internal token (Story 010): `effectiveRoles = grantedRoles + (trialRoles if not expired else
[])`, both filtered by application scope as already designed in ADR 0017. This is a trivial,
local, no-network-call comparison — the "middleware" doing this merge is portcullis's own
internal-token-signing step (or, longer term, any authstar-published client library that
performs the equivalent merge for a consuming application, should that pattern extend beyond
portcullis).

### Baseline roles surviving expiry is a consequence, not a special case

Because `grantedRoles` are always included regardless of `trialExpiresAt`, an admin gets
"roles that survive trial expiry" for free by simply putting whatever baseline access they want
guaranteed (e.g. a role that lets an expired account reach only the billing/upgrade flow) into
`grantedRoles`, and putting the full trial-period product access into `trialRoles`. No reserved
role name, no special "expired" marker, no extra logic — this **retires** the
`expiredRole`/`trial_expired` reserved-role idea floated earlier in this discussion in favor of
this simpler mechanism.

### Seat limits remain a separate, simple concern

Org-level capacity checks (used at invite-send time, per the earlier invite discussion) stay a
plain tenant-scoped value materialized from keep — unrelated to the role-merge logic above, no
change from what was already discussed.

## Consequences

- **Story 010** (internal JWT generation) needs updating: the `Allow` outcome now carries
  `grantedRoles`/`trialRoles`/`trialExpiresAt` instead of a single pre-merged `roles` list, and
  portcullis performs the merge described above before signing.
- Tower's enrichment HTTP contract carries the same three fields, unconditionally.
- `web`'s eventual design needs to account for talking to both `tower` (identity/roles/tenants/
  applications) and `keep` (billing/entitlements/trials) directly, rather than everything
  routing through tower as a single facade — a lighter-weight service-oriented split than the
  original "web operates via the tower API" framing implied literally.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md), [ADR 0003](0003-enrichment-outcome-response-contract.md), [ADR 0006](0006-rabbitmq-as-message-broker.md), [ADR 0017](0017-account-identity-and-role-model.md)
