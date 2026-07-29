# ADR 0039: Trials and Coupons in Keep

- **Status:** Accepted
- **Date:** 2026-07-29
- **Affects:** keep, tower
- **Resolves an open item in:** [ADR 0019](0019-invite-codes.md)

## Context

ADR 0018 sketched org-level and individual-level trials conceptually but never gave keep a
concrete actor for them. ADR 0019 deferred coupon codes to keep's own design and explicitly
flagged an open question: should a single marketing code be able to grant both access (tower's
`inviteCode`) and a discount/entitlement (keep's domain) in one redemption?

## Decision

### `trial` — formalizes what ADR 0018 described

```ts
{
  tenant: '', scope: { account: '' } | { tenant: '' },
  grantedRoles: [], seatLimit: null,    // seatLimit only meaningful for tenant scope
  expiresAt: '', status: 'active' | 'converted' | 'expired',
  extensions: [{ by: '', at: '', newExpiresAt: '' }],   // audit trail for admin extend/reissue
}
```

A trial exists independent of any Stripe subscription — someone in a no-payment-method trial
has no Stripe object at all until they actually convert. Converting creates the `subscription`
(ADR 0038) and the trial's `status` moves to `converted`. `extensions` gives ADR 0018's
"app admin extends or reissues a trial" capability a concrete, auditable record — extend and
reissue are the same underlying operation, appending a new entry.

### `coupon` — scoped specifically to entitlement grants, not pure price discounts

Stripe already has native Coupon/Promotion Code objects that handle pure percentage/fixed-
amount discounts end-to-end on the tenant's own connected account — keep has no reason to
reimplement that; those need zero keep-side modeling. Keep's own `coupon` concept exists only
for codes that grant something **beyond** a price adjustment — a free trial period, bonus
seats, bonus roles:

```ts
{
  code: '', tenant: '',
  grantedRoles: [], trialDurationDays: null, seatLimit: null,
  maxRedemptions: null, redemptionCount: 0,
  status: 'active' | 'revoked' | 'expired', expiresAt: '',
}
```

This is structurally close to tower's `inviteCode` (ADR 0019) by design — both are "a
shareable code granting some benefit," just in adjacent domains (access vs. billing-relevant
entitlement).

### Resolves ADR 0019's open question: no shared code primitive between tower and keep

A single marketing code that should grant both access and a discount doesn't get a new
cross-service mechanism — tower and keep have never talked to each other directly anywhere in
this design (ADR 0018), and inventing a shared code primitive now would be the first exception
to that. Instead, this is a `web`/admin-level orchestration: create a matching `inviteCode` in
tower and a `coupon` in keep, sharing the same code string by convention. The redemption flow
checks both. This keeps the services properly decoupled rather than coupling them for the sake
of one marketing convenience.

## Consequences

- Keep needs `trial` and `coupon` actors and the redemption/conversion logic connecting them to
  `subscription` (ADR 0038).
- `web`'s eventual design needs a way to create a matching pair of codes across tower and keep
  for the combined-code case — not designed further here.
- Pure Stripe-native discount codes need no authstar-side modeling at all.

## Related

- [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md)
