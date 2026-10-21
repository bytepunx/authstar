# ADR 0083: Keep Actor Boundary Corrections — Keys, Missing Fields, and a Stale Contradiction

- **Status:** Accepted
- **Date:** 2026-08-05
- **Affects:** keep
- **Corrects:** [ADR 0039](0039-keep-trials-and-coupons.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0077](0077-keep-refunds-and-disputes.md)
- **Clarifies:** [ADR 0046](0046-tenant-owned-stripe-configuration.md)

## Context

Consolidating keep's full actor model in preparation for writing its Stories (the same exercise
[ADR 0082](0082-tower-actor-boundary-corrections.md) did for tower) surfaced the same class of
gap, plus one stale cross-ADR contradiction:

1. **`coupon.code` is a bare, non-composite business key** — the exact same shape of gap ADR
   0082 already fixed for tower's `inviteCode`. ADR 0039 explicitly modeled `coupon` "structurally
   close to tower's `inviteCode` by design," but the fix that followed for one was never applied
   to the other. A tenant-chosen, human-memorable code (`LAUNCH50`) can collide across tenants
   exactly the way `inviteCode.code` could.
2. **`usageRecord`'s business key (`idempotencyKey`) is app-supplied and not tenant-scoped.**
   Unlike most identifiers in this design, `idempotencyKey` originates from the *adopting
   application*, not from tower/keep/portcullis (ADR 0043: "`idempotencyKey` is app-supplied and
   required") — a materially less trustworthy source than an internally-generated flake id.
   Two different tenants' applications could plausibly supply the same value (a predictable
   counter, a poorly-implemented client), silently colliding.
3. **`refund` and `dispute` have no field that actually serves as their business key.** Both
   ADR 0077 shapes carry `stripeChargeId`, but Stripe permits multiple partial refunds against
   one charge — `stripeChargeId` alone can't uniquely identify a `refund`. Neither shape ever
   included the actual Stripe object id (`stripeRefundId`/`stripeDisputeId`) needed to be a real
   key.
4. **No keep actor anywhere has an explicit `identifiedBy`/`searchableBy` declared.** Every keep
   ADR describes a state shape but never the `consequent` actor-module metadata around it — a
   real gap when the goal is an implementation-ready reference, not present for tower's actors
   either before ADR 0082.
5. **ADR 0046 and ADR 0047 read as contradicting each other, but don't** — ADR 0046 calls plan-
   mapping role/application validation "a genuine limitation" keep structurally can't fix
   ("keep doesn't check... because there isn't one it can reach"). ADR 0047, written immediately
   after, built exactly that fix (a local, tower-sourced reference cache with a startup backfill)
   and states plainly that keep's plan-mapping writes now validate against it. The two were never
   cross-referenced, so a reader encountering ADR 0046 alone has no way to know the limitation it
   names was already resolved one ADR later.

## Decision

### `coupon.identifiedBy` becomes `{tenant}:{code}`

```ts
{
  actor: { namespace: 'keep', type: 'coupon', identifiedBy: 'key',
           searchableBy: ['tenant', 'status'] },
  state: {
    key: '',   // `${tenant}:${code}`
    code: '', tenant: '',
    grantedRoles: [], trialDurationDays: null, seatLimit: null,
    maxRedemptions: null, redemptionCount: 0,
    status: 'active' | 'revoked' | 'expired', expiresAt: '',
  }
}
```

Identical fix, identical reasoning, to `inviteCode` (ADR 0082) — `code` may repeat freely across
tenants; only `key` must be unique. The `web`/admin-level convention of a matching `inviteCode`
and `coupon` sharing the same code string (ADR 0039's own resolution to ADR 0019's flagged
combined-code question) is unaffected — both actors independently apply the same per-tenant
scoping to that shared string.

### `usageRecord.identifiedBy` becomes `{tenant}:{idempotencyKey}`

```ts
{
  actor: { namespace: 'keep', type: 'usageRecord', identifiedBy: 'key',
           searchableBy: ['tenant', 'application', 'meter'] },
  state: {
    key: '',   // `${tenant}:${idempotencyKey}`
    tenant: '', application: '', accountId: '',
    meter: '', quantity: 0, idempotencyKey: '',
    createdAt: '',
  }
}
```

Since `idempotencyKey` is application-supplied rather than internally generated, tenant-scoping
it closes a real (if lower-probability) cross-tenant collision — the same category of risk as
`coupon`/`inviteCode`, just from a less trusted source instead of a human choosing a marketing
string. `searchableBy` gains `application`/`meter` specifically because `GET /usage-records` is
documented as filterable by both (ADR 0041) — never stated as an indexed field until now.

### `refund`/`dispute` gain their actual Stripe object id as the real key

```ts
// refund
{
  actor: { namespace: 'keep', type: 'refund', identifiedBy: 'stripeRefundId',
           searchableBy: ['tenant', 'stripeChargeId'] },
  state: { tenant: '', scope: { account: '' } | { tenant: '' }, stripeChargeId: '',
           stripeRefundId: '', amount: 0, currency: '', reason: '', refundedAt: '' },
}

// dispute
{
  actor: { namespace: 'keep', type: 'dispute', identifiedBy: 'stripeDisputeId',
           searchableBy: ['tenant', 'stripeChargeId', 'status'] },
  state: { tenant: '', scope: { account: '' } | { tenant: '' }, stripeChargeId: '',
           stripeDisputeId: '', status: 'needs_response' | 'under_review' | 'won' | 'lost',
           amount: 0, currency: '', reason: '', createdAt: '' },
}
```

`stripeChargeId` moves to `searchableBy` (a charge can be looked up for its refunds/disputes,
still useful) but stops being treated as if it could serve as the identifier — Stripe permits
multiple partial refunds per charge, so it never actually could. Both Stripe object ids were
always present in the webhook payloads that create these records; this just names the field ADR
0077 never explicitly listed.

### Every keep actor gets explicit `identifiedBy`/`searchableBy` for the first time

`customer`, `planMapping`, `subscription`, and `trial` were all specified as bare state shapes,
with actor-module metadata never written down anywhere. Resolved as:

- **`customer`**: generated id (not scope-derived — a tenant-scoped and an account-scoped
  customer are both just "a customer record," no reason to give them different key shapes),
  `searchableBy: ['tenant', 'scope', 'stripeCustomerId']` — the last field specifically because
  the webhook handler that creates these on first checkout needs to check for an existing record
  before creating a duplicate.
- **`planMapping`**: generated id (route already implies this, `/plan-mappings/{id}`),
  `searchableBy: ['tenant', 'stripePriceId', 'status']` — `stripePriceId` because the webhook
  event table (ADR 0038) resolves incoming events by looking up the mapping for a given Price.
- **`subscription`**: **`identifiedBy: 'stripeSubscriptionId'` directly** — unlike the app-
  supplied `idempotencyKey` above, Stripe subscription ids are Stripe-generated and globally
  unique; no tenant-prefixing needed, and using it directly makes every webhook update
  (`customer.subscription.updated`/`.deleted`) a direct fetch, not a search.
- **`trial`**: generated id, `searchableBy: ['tenant', 'scope', 'status']`.

### Clarifying, not correcting: ADR 0046's "genuine limitation" was resolved by ADR 0047

No shape or behavior changes here — just closing a documentation gap that reads as a
contradiction. A pointer note is added to ADR 0046 confirming ADR 0047 (published immediately
after it) built the reference-cache validation ADR 0046 called out as missing. Keep's
plan-mapping writes **do** validate `grantedRoles` against a real, tower-sourced application/
role cache today — ADR 0046's limitation was accurate when written and is no longer current.

## Consequences

- `coupon` and `usageRecord` both gain composite, tenant-scoped keys — a breaking change to
  their key shape, but (as with `inviteCode`) there's no running system yet to migrate, so it
  costs nothing to fix now.
- `refund`/`dispute` gain the Stripe object id fields that should have been their key from the
  start.
- Every keep actor now has explicit `consequent` actor-module metadata, closing the gap that
  made tower's ADR 0082 necessary in the first place.
- ADR 0046 gets a pointer note; no behavior changes as a result.

## Related

- [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0039](0039-keep-trials-and-coupons.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0077](0077-keep-refunds-and-disputes.md), [ADR 0082](0082-tower-actor-boundary-corrections.md) (the same pattern of correction, applied to tower first)
