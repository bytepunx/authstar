# ADR 0038: Plan-to-Entitlement Mapping and Subscription Tracking

- **Status:** Accepted (corrected by [ADR 0042](0042-single-account-billing-model.md))
- **Date:** 2026-07-29
- **Affects:** keep
- **Builds on:** [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md) — **note:**
  ADR 0037 is superseded; read `planMapping` below with ADR 0042's correction — `stripePriceId`
  refers to the installation's own Stripe account, defined by the operator, not by each tenant.
  `merchantAccount` (referenced in the webhook table) is replaced by ADR 0042's `customer`
  record, and the `account.updated` (Connect-specific) row no longer applies.

## Context

Since tenants own their own Stripe account (ADR 0037), they also own their own pricing —
their own Stripe Products and Prices, set up however they like. Keep's job isn't to reinvent
billing/subscription logic Stripe's Billing product already does well; it's to map "this tenant
subscribed to their own Price X" onto "these authstar entitlements" and drive the
`entitlement.*` events already specified in ADR 0031.

## Decision

### `planMapping` — tenant-defined, not an authstar-fixed catalog

```ts
{ tenant: '', stripePriceId: '', name: '', seatLimit: null, grantedRoles: [] }
```

A tenant decides their own pricing tiers in Stripe, then tells keep (via `web`) what each price
grants in authstar terms. This is the direct continuation of ADR 0037's principle — authstar
doesn't dictate a plan catalog, it lets each tenant define their own and just handles the
mapping.

### `subscription` — tracks the tenant's or account's current standing

```ts
{
  tenant: '', scope: { account: '' } | { tenant: '' },   // same org/individual duality as ADR 0018
  stripeSubscriptionId: '', stripePriceId: '',
  status: 'active' | 'past_due' | 'canceled' | 'trialing',
  currentPeriodEnd: '',
}
```

### Webhook-driven, publishing through the existing `entitlement.*` contract unchanged

Keep's platform-level webhook endpoint (ADR 0037) reacts to Stripe Connect events and issues
the corresponding `entitlement.*` events — no change to ADR 0031's contract, this just gives it
a concrete source:

| Stripe event | Keep's action |
|---|---|
| `customer.subscription.created` / `checkout.session.completed` | Look up `planMapping` for the price, publish `entitlement.converted-to-paid` (or `role-granted`) with the mapped roles/seat limit |
| `customer.subscription.updated` (upgrade/downgrade) | Look up the new `planMapping`, publish the role-granted/revoked delta reflecting the change |
| `customer.subscription.deleted` | Publish role-revoked events for the paid-tier grants |
| `account.updated` (Connect-specific, about the connected account itself) | Updates `merchantAccount.status` (ADR 0037) — this is about whether the *tenant* can still process payments, a separate concern from any individual end-user's entitlements |

### Non-payment handling — resolves the original motivating example from ADR 0001

ADR 0001's very first framing of why enrichment needed to be a live call used "a non-payment
threshold being crossed" as the example — this is where that finally gets a concrete mechanism.
`invoice.payment_failed` starts a grace period; after a configured number of failed attempts
(a tunable, not specified here), keep publishes an entitlement event that **degrades to
`grantedRoles`-only**, reusing the exact same trial-expiry degrade pattern from ADR 0018 rather
than inventing new tower-side machinery — the account can still authenticate, just with
whatever baseline access `grantedRoles` provides (e.g. enough to reach a billing/payment page),
not full suspension. This is a deliberate reuse: non-payment and trial-expiry are the same
shape of problem (paid-for access lapsing) and get the same solution.

## Consequences

- Keep needs Stripe webhook signature verification and the event-to-mapping-lookup logic above.
- No change to ADR 0031's `entitlement.*` contract or ADR 0018's `grantedRoles`/`trialRoles`
  merge logic on the portcullis side — both are reused as-is.
- The exact non-payment grace-period/attempt-count thresholds are left as tunable config, not
  fixed here.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md) (the original non-payment example), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0031](0031-keep-tower-entitlement-events.md), [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md)
