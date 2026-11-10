---
title: "Story 002: Stripe Webhook Handling"
updated: 2026-11-10
status: draft
---
# Story 002 — Stripe Webhook Handling

**Epic:** Billing
**Repo:** keep
**Status:** Draft
**New — keep's side of the mechanism [ADR 0038](../../adrs/0038-plan-mapping-and-subscription-tracking.md)/
[ADR 0046](../../adrs/0046-tenant-owned-stripe-configuration.md)/
[ADR 0077](../../adrs/0077-keep-refunds-and-disputes.md) already specify.**
Per [ADR 0031](../../adrs/0031-keep-tower-entitlement-events.md),
[ADR 0038](../../adrs/0038-plan-mapping-and-subscription-tracking.md),
[ADR 0041](../../adrs/0041-keep-api-surface.md),
[ADR 0044](../../adrs/0044-web-surfaces-and-distribution-model.md),
[ADR 0046](../../adrs/0046-tenant-owned-stripe-configuration.md),
[ADR 0077](../../adrs/0077-keep-refunds-and-disputes.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `customer`/`subscription`/`refund`/
`dispute` shapes.

---

## Ingress and authentication

- [ ] `POST /_authstar/webhooks/stripe` is a **portcullis reserved path**, not a keep-owned
      direct ingress — registered against each tenant's `_admin` application's stable host (ADR
      0044), resolved via normal `Host`-based tenant/application resolution, proxied straight to
      keep with **no session or internal-JWT check** (ADR 0046). Stripe's own webhook signature
      is the actual authentication.
- [ ] Keep verifies the signature against `tenant-<slug>-stripe-webhook-secret` (the tenant's own
      key, pushed via `stripe-config`, Story 001) — a mismatch is rejected outright, logged, never
      processed.
- [ ] Every event is scoped to exactly one tenant (the one whose webhook secret validated it) —
      there is no cross-tenant event to worry about misrouting.

---

## Event handling

| Stripe event | Keep's action |
|---|---|
| `customer.subscription.created` / `checkout.session.completed` | Create/update `customer` (find-or-create by `stripeCustomerId`, Story 001). Create `subscription` (keyed by `stripeSubscriptionId`). Look up the matching **active** `planMapping` by `stripePriceId` — see "Entitlement publishing" below. |
| `customer.subscription.updated` (upgrade/downgrade) | Update `subscription.status`/`currentPeriodEnd`/`stripePriceId` with the status Stripe sent, any of Stripe's eight ([ADR 0107](../../adrs/0107-keep-mirrors-stripe-s-subscription-status-and-degrades-plan-roles-after-a-grace.md)). While the plan's roles are in effect, look up the **new** `planMapping` and publish the role-granted/revoked **delta** against the previous mapping's `roles` (compute the diff, don't just re-grant everything). A move to `unpaid`, `canceled`, or `paused` degrades. |
| `customer.subscription.deleted` | Update `subscription.status` to the status Stripe sent. Degrade, unless the status is `incomplete_expired`, a subscription that never started. |
| `customer.subscription.paused` / `.resumed` | Mirror the status. Paused degrades; resumed restores. |
| `invoice.payment_failed` | Record the invoice's `attempt_count` and `next_payment_attempt` on the subscription, and leave its status alone: Stripe sends `customer.subscription.updated` with `past_due` beside it. Degrade only when the count reaches the tenant's `paymentFailureAttempts` (default 3, set in `stripe-config`), or sooner when the status becomes `unpaid` or `canceled` (ADR 0107). |
| `invoice.paid` | Clear the failure record. Restore a degraded subscription whose status is `active` or `trialing`, reading the status from Stripe first when keep's copy is not yet restorable. A `canceled` subscription stays degraded. |
| `charge.refunded` | Create a `refund` record (Story 001, keyed by `stripeRefundId`). **No entitlement event published** — recorded for visibility only. |
| `charge.dispute.created` | Read the charge by `dispute.charge`, find keep's `customer` by its Stripe customer, and take that record's scope; dispute metadata is never read (ADR 0107). Create a `dispute` record (`status: "needs_response"`) with that scope, and degrade that scope's subscription with the **same** degrade `invoice.payment_failed` uses. The dispute records the subscription it degraded. With no customer record, the dispute is recorded with no scope and changes no entitlement. |
| `charge.dispute.closed`, `status: "won"` | Update `dispute`. Restore only the subscription that dispute degraded, if any. |
| `charge.dispute.closed`, `status: "lost"` | Update `dispute` only. No entitlement action — any subscription-level consequence (Stripe frequently cancels on a lost dispute) arrives independently via `customer.subscription.deleted`, not duplicated here. |
| `account.updated` | **Never applies** — Connect-specific, moot under the tenant-owned-Stripe-account model (no connected-account status concept exists here at all). Received and ignored if Stripe ever sends it, not treated as an error. |

---

## Entitlement publishing — resolving `converted-to-paid` vs. `role-granted`'s "or"

ADR 0038's own event table lists `entitlement.converted-to-paid` (or `role-granted`) somewhat
loosely. Resolved here as **both, serving different purposes**, not alternatives:

- [ ] `entitlement.converted-to-paid { tenant, scope, sequence, roles }` — one, informational,
      marking the transition itself (useful for conversion-funnel tracking downstream); it
      carries the plan mapping's `roles` ([ADR 0108](../../adrs/0108-plan-mappings-grant-roles-granted-roles-is-tower-s-set-in-effect.md)).
- [ ] `entitlement.role-granted { tenant, scope, sequence, role: { name, scope } }` — **one per
      role** in the plan mapping's `roles` list (ADR 0031's shape is explicitly
      single-role per event; a mapping granting three roles fans out to three events, not one
      event carrying an array).
- [ ] `entitlement.seat-limit-changed { tenant, scope: { organization }, sequence, seatLimit }` —
      only if the mapping sets `seatLimit` and the scope is an organization: an account has no
      seats ([ADR 0109](../../adrs/0109-entitlement-scopes-are-accounts-and-organizations-the-tenant-scope-is-retired.md)).
- [ ] All three (where applicable) share **one monotonically-increasing `sequence`** per
      `(tenant, scope)` — not per event type — since ADR 0031's ordering-defense tooling assumes
      a single sequence space a consumer can detect gaps against, not one per event type.
- [ ] Every scope is `{account}` or `{organization}`. An object with neither, in its metadata
      or on the customer keep holds, is recorded nowhere and publishes nothing (ADR 0109).
- [ ] A second activation of a subscription keep already records, such as
      `checkout.session.completed` after `customer.subscription.created`, publishes nothing.

## Degrade and restore

- [ ] Degrade publishes `entitlement.role-revoked` for each of the plan mapping's `roles` and
      sets the subscription's `entitlement` to `degraded`. Restore publishes `role-granted` for
      each and sets `granted`. Each is a no-op when the subscription is already in that state,
      so overlapping triggers publish once (ADR 0107).

## Each Stripe event is handled once

- [ ] After the signature check, keep looks up the event's id, keyed by tenant and Stripe event
      id. A recorded id answers 200 and runs no handler, so a redelivery changes nothing and
      publishes nothing.
- [ ] The id is recorded only after its handler succeeds, so an event whose handler failed runs
      again when Stripe redelivers it.

---

## Usage-metering publishing (cross-reference, not re-derived)

- [ ] `entitlement.usage-updated` — already fully specified in
      [Story 001](001-actor-definitions.md)'s `usageRecord` section (current-value-replace, same
      shape family as the events above) — published from the usage-recording path (ADR 0043/0079),
      not from webhook handling; listed here only so this story's event table isn't mistaken for
      exhaustive.

---

## Not Covered Here

- The actual `POST /tenants/{tenantSlug}/checkout-sessions` creation call (what starts a
  subscription in the first place) — a separate future story.
- Tower's consumption of `entitlement.*` — already specified in
  [tower Story 001](../tower/001-actor-definitions.md) (`account.usage`) and ADR 0018/0031
  generally; this story only covers keep's publishing side.
