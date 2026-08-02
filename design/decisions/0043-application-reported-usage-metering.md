# ADR 0043: Application-Reported Usage Metering

- **Status:** Accepted
- **Date:** 2026-07-30
- **Affects:** portcullis, keep, tower
- **Builds on:** [ADR 0038](0038-plan-mapping-and-subscription-tracking.md) (as corrected by [ADR 0042](0042-single-account-billing-model.md)), [ADR 0031](0031-keep-tower-entitlement-events.md)

## Context

Every other authstar interaction stays entirely upstream of an adopting application — the app's
only awareness of authstar is the internal JWT it reads for identity/roles. Metered billing is
different: only the application knows when a billable action actually occurred, so some minimal
app-side awareness is unavoidable. The goal is minimizing that awareness to the smallest
possible surface, not eliminating it.

## Decision

### The app reports usage by calling back through the same gate, using only what it already has

```
POST {X-Forwarded-Proto}://{X-Forwarded-Host}/_authstar/usage
Authorization: Bearer <the same internal JWT the app received on the inbound request>

{ meter: "report-generated", quantity: 1, idempotencyKey: "..." }
```

Both `X-Forwarded-Host`/`X-Forwarded-Proto` (Story 011) and the internal JWT (Story 010) are
already present on every request the app handles — no new URL to discover, no new credential
type, no SPIFFE trust extended into the app. `meter` is an open, tenant-defined vocabulary (the
tenant's operator tells the app what meter names exist, the same out-of-band relationship as
any other billing integration), `quantity` defaults to `1`, `idempotencyKey` is
app-supplied and required.

**This only works synchronously, within the internal JWT's 60-second lifetime** — an app
reporting usage from a background job or a deferred/batched process has no live internal JWT to
use. That's a genuinely different, harder problem (a durable, app-held API credential issued by
`keep`) and is **explicitly not solved here** — flagged rather than papered over. **Resolved by
[ADR 0079](0079-batched-usage-reporting-credentials.md)**: a keep-issued, hashed credential and
a second, exempt reserved path (`/_authstar/usage-reports`) converging on this same recording
logic.

### `/_authstar/usage` is not fire-and-forget — this is the request, not a passenger on one

Unlike Story 020's analytics dispatch (which piggybacks on an unrelated request and must never
risk it), this call exists *only* to report usage — there is no other request to protect.
Portcullis verifies the internal JWT locally (Story 009's logic, pointed at the tenant's
internal keypair instead of the session keypair — `kid` selects the key, signature/`iss`/`aud`/
`exp` checked the same way, no tower call needed since portcullis signed this token itself),
resolves tenant/application/accountId/roles from its claims, and proxies the call through to
`keep` over SPIFFE mTLS — a real request/response, not a dispatch-and-drop. Keep's response
(recorded, duplicate, or rejected) is relayed back to the app unchanged. Whether the app itself
awaits that response or fires it without waiting is the app's own choice, not portcullis's
concern.

### Keep durably records, idempotently, and validates the meter

`usageRecord`, keyed by `idempotencyKey` (the same idempotency-key-as-business-key pattern
established in ADR 0022) — a redelivered or app-retried report is a no-op, not a double-charge.
Keep validates `meter` against the tenant's own metered `planMapping` entries (extended below)
and rejects unrecognized meters rather than recording against nothing. Keep's response can
include the current period's running total for that meter, giving the app an immediate
synchronous answer in addition to the async path below.

### `planMapping` (ADR 0038) gains an optional `meter` field

```ts
{ tenant: '', stripePriceId: '', name: '', seatLimit: null, grantedRoles: [], meter: null }
```

A metered price is a plan mapping with `meter` set — ties usage recording directly to the
billing side without inventing a separate meter catalog. Keep aggregates recorded usage and
reports it to Stripe against the mapped metered Price (Stripe-specific mechanics — periodic vs.
per-event reporting — are keep's own implementation detail, not specified further here).

### Keep publishes the running total to tower — mirrors `seat-limit-changed`'s existing shape, not a new pattern

```ts
// entitlement.usage-updated
{ tenant: '', scope: { account: '' } | { tenant: '' }, application: '', meter: '', periodUsage: 0, periodLimit: null, sequence: 0 }
```

This is a **current-value replace**, not a delta — the same shape ADR 0031's `seat-limit-changed`
already established, not a new idempotency problem to solve. A redelivered or out-of-order copy
of the same value applied twice produces the same result, unlike a naive increment would.
Publish cadence (on every recorded event vs. debounced) is keep's own choice — tower doesn't
care, it just applies whatever value arrives.

### Enrichment gains `usage`, scoped by application — closes the loop back onto the JWT

Tower's `Allow` outcome (ADR 0017/0018, Story 010) gains a fourth field alongside
`grantedRoles`/`trialRoles`/`trialExpiresAt`:

```ts
usage: [ { application: '', meter: '', periodUsage: 0, periodLimit: null } ]
```

filtered to the resolved application the same way roles already are. Portcullis attaches this
to the internal token unchanged — no merge logic needed here the way trial-expiry required one,
since tower already only returns current values.

### This is advisory, not enforcement — track-then-bill is the default

The app sees its own current usage on the *next* request's internal token — necessarily one
keep→tower round trip stale, since it's driven by the same eventually-consistent
materialization used everywhere else keep feeds tower. Treat it the same way as
`enrichment_status: "degraded"` — a hint an app can use to self-throttle or show a usage
indicator, never a guarantee against overage. **Authstar does not enforce a hard real-time cap.**
The default model is track-then-bill (the app performs the action, usage is recorded and billed
after the fact, overage is billed rather than blocked) — the same shape most usage-based billing
products use. Real-time hard enforcement is a different, harder problem (it would require a
synchronous keep call on the hot path, defeating the "never block the proxied request on a slow
dependency" discipline this whole design has maintained) and is not designed here.

## Consequences

- **Story 010** needs updating: `Allow`'s claim set gains `usage`, attached to the internal
  token unchanged (no merge logic, unlike the trial-roles case).
- New **Story 021** needed for portcullis's `/_authstar/usage` route and its distinct
  (non-fire-and-forget, internal-JWT-authenticated) handling.
- **ADR 0038**'s `planMapping` gains the optional `meter` field.
- Keep needs the `usageRecord` actor, meter validation against `planMapping`, Stripe usage
  reporting, and the `entitlement.usage-updated` publisher.
- Tower needs a consumer for `entitlement.usage-updated`, materializing into the same view
  actor that already serves `grantedRoles`/`trialRoles`.

## Related

- [ADR 0022](0022-herald-communications-service.md) (idempotency-key-as-business-key pattern), [ADR 0031](0031-keep-tower-entitlement-events.md) (`seat-limit-changed`'s current-value-replace shape, reused here), [ADR 0035](0035-lookout-and-chronicle-analytics.md) (the fire-and-forget pattern this deliberately does *not* reuse, and why)
