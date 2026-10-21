---
id: ADR-0077
title: Keep Refund and Dispute Handling
status: accepted
date: 2026-08-02
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0077: Keep Refund and Dispute Handling

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** keep, web
- **Extends:** [ADR 0038](0038-plan-mapping-and-subscription-tracking.md)

> **Corrected 2026-08-05 ([ADR 0083](0083-keep-actor-boundary-corrections.md)):** neither shape
> below ever included the actual Stripe object id (`stripeRefundId`/`stripeDisputeId`) —
> `stripeChargeId` alone can't uniquely key `refund`, since Stripe permits multiple partial
> refunds against one charge. Both actors gain their real Stripe id as `identifiedBy`;
> `stripeChargeId` moves to `searchableBy`.

## Context

Keep's Stripe webhook table (ADR 0038) covers subscription lifecycle events only —
`customer.subscription.created`/`checkout.session.completed`/`updated`/`deleted` and
`account.updated`. `charge.refunded` and `charge.dispute.*` appear nowhere in this design; not
partially built, not flagged as deferred — a genuine, complete omission with no admin-visible
concept for either.

## Decision

Two new read-only, webhook-populated actors — visibility first, no automatic entitlement logic for refunds.

### Two new read-only, webhook-populated actors — visibility first, no automatic entitlement logic for refunds

```ts
// refund
{ tenant: '', scope: { account: '' } | { tenant: '' }, stripeChargeId: '',
  amount: 0, currency: '', reason: '', refundedAt: '' }

// dispute
{ tenant: '', scope: { account: '' } | { tenant: '' }, stripeChargeId: '',
  status: 'needs_response' | 'under_review' | 'won' | 'lost',
  amount: 0, currency: '', reason: '', createdAt: '' }
```

| Stripe event | Keep's action |
|---|---|
| `charge.refunded` | Create a `refund` record. **No automatic entitlement change** — a partial or goodwill refund shouldn't revoke access, and a refund tied to an actual cancellation already arrives separately via the existing `customer.subscription.deleted` handling. Recorded for visibility/audit only. |
| `charge.dispute.created` | Create a `dispute` record (`status: needs_response`). **Degrades entitlements the same way non-payment does** — reuses ADR 0038's existing `grantedRoles`-only degrade pattern verbatim, the identical reasoning ADR 0038 already gave for reusing the trial-expiry shape ("a deliberate reuse... the same shape of problem"). A dispute is a serious-enough signal (potential fraud/chargeback) to warrant the same treatment as a failed payment, without inventing new tower-side machinery. |
| `charge.dispute.closed` (`status: won`) | Update the `dispute` record; **reverses the degrade**, restoring normal entitlements. |
| `charge.dispute.closed` (`status: lost`) | Update the `dispute` record only. Any subscription-level consequence (Stripe frequently cancels the subscription on a lost dispute) arrives independently via the existing `customer.subscription.deleted` handling — not duplicated here. |

### New routes, reusing the existing `billing:read` permission

```
GET /tenants/{tenantSlug}/refunds
GET /tenants/{tenantSlug}/disputes
```

Read-only through this API, same posture as **Subscriptions** — state changes are webhook-driven,
never admin-initiated through a write route. No new permission: viewing refunds/disputes is the
same class of concern ADR 0060 already scoped `billing:read` for ("viewing a revenue summary
shouldn't require the ability to edit plans/Stripe config").

### `web` — two new read-only sub-sections in Billing, no new IA

Alongside Subscriptions (ADR 0054) — list, filterable by status/date range for disputes. A
dispute in `needs_response` gets a visible warning treatment (time-sensitive; Stripe itself
enforces a response deadline) but `web` doesn't build any response-submission flow — that stays
in the tenant's own Stripe dashboard, consistent with how this design has repeatedly deferred
to Stripe's own richer UI for anything beyond what keep itself tracks (ADR 0054's Customer
section sets this precedent explicitly).

## Consequences

- Two new keep actors, two new webhook handlers, two new read-only routes.
- Entitlement degrade/restore on dispute open/win reuses ADR 0038's existing mechanism exactly
  — no new tower-side capability.
- Refunds carry no entitlement consequence by design — a deliberate, narrower scope than
  disputes, not an oversight.

## Related

- [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0054](0054-web-billing-and-communications-screens.md), [ADR 0060](0060-activity-feed-and-revenue-summary.md)
