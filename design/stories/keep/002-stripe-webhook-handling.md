# Story 002 — Stripe Webhook Handling

**Epic:** Billing
**Repo:** keep
**Status:** Draft
**New — keep's side of the mechanism [ADR 0038](../../decisions/0038-plan-mapping-and-subscription-tracking.md)/
[ADR 0046](../../decisions/0046-tenant-owned-stripe-configuration.md)/
[ADR 0077](../../decisions/0077-keep-refunds-and-disputes.md) already specify.**
Per [ADR 0031](../../decisions/0031-keep-tower-entitlement-events.md),
[ADR 0038](../../decisions/0038-plan-mapping-and-subscription-tracking.md),
[ADR 0041](../../decisions/0041-keep-api-surface.md),
[ADR 0044](../../decisions/0044-web-surfaces-and-distribution-model.md),
[ADR 0046](../../decisions/0046-tenant-owned-stripe-configuration.md),
[ADR 0077](../../decisions/0077-keep-refunds-and-disputes.md).
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
| `customer.subscription.updated` (upgrade/downgrade) | Update `subscription.status`/`currentPeriodEnd`/`stripePriceId`. Look up the **new** `planMapping`, publish the role-granted/revoked **delta** against the previous mapping's roles (compute the diff, don't just re-grant everything). |
| `customer.subscription.deleted` | Update `subscription.status: "canceled"`. Publish `entitlement.role-revoked` for every role the terminated plan mapping granted. |
| `invoice.payment_failed` | Starts a grace period (tunable attempt-count threshold, not fixed here). After the threshold, publish an entitlement event degrading to `grantedRoles`-only — reuses the exact `trialRoles`-stripped degrade shape ADR 0018 already established for trial expiry, not new tower-side machinery. |
| `charge.refunded` | Create a `refund` record (Story 001, keyed by `stripeRefundId`). **No entitlement event published** — recorded for visibility only. |
| `charge.dispute.created` | Create a `dispute` record (`status: "needs_response"`). Publish the **same** `grantedRoles`-only degrade event `invoice.payment_failed` uses — one shared degrade mechanism, two triggers. |
| `charge.dispute.closed`, `status: "won"` | Update `dispute`. Publish the **reverse** of the degrade — restore the plan mapping's normal `grantedRoles` (a fresh `role-granted` set, not a "undo" event type — tower's command handlers are idempotent set-membership operations, ADR 0031, so re-granting what should already be granted is safe either way). |
| `charge.dispute.closed`, `status: "lost"` | Update `dispute` only. No entitlement action — any subscription-level consequence (Stripe frequently cancels on a lost dispute) arrives independently via `customer.subscription.deleted`, not duplicated here. |
| `account.updated` | **Never applies** — Connect-specific, moot under the tenant-owned-Stripe-account model (no connected-account status concept exists here at all). Received and ignored if Stripe ever sends it, not treated as an error. |

---

## Entitlement publishing — resolving `converted-to-paid` vs. `role-granted`'s "or"

ADR 0038's own event table lists `entitlement.converted-to-paid` (or `role-granted`) somewhat
loosely. Resolved here as **both, serving different purposes**, not alternatives:

- [ ] `entitlement.converted-to-paid { tenant, scope, sequence }` — one, informational, marking
      the transition itself (useful for conversion-funnel tracking downstream); carries no role
      data and triggers no tower-side command on its own.
- [ ] `entitlement.role-granted { tenant, scope, sequence, role: { name, scope } }` — **one per
      role** in the plan mapping's `grantedRoles` list (ADR 0031's shape is explicitly
      single-role per event; a mapping granting three roles fans out to three events, not one
      event carrying an array).
- [ ] `entitlement.seat-limit-changed { tenant, scope: { tenant }, sequence, seatLimit }` — only
      if the mapping sets `seatLimit`.
- [ ] All three (where applicable) share **one monotonically-increasing `sequence`** per
      `(tenant, scope)` — not per event type — since ADR 0031's ordering-defense tooling assumes
      a single sequence space a consumer can detect gaps against, not one per event type.

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
