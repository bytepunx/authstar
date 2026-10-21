---
title: "Story 006: Self-Service Subscription, Stripe Config, and Activity"
updated: 2026-08-05
status: draft
---
# Story 006 — Self-Service Subscription, Stripe Config, and Activity

**Epic:** Billing
**Repo:** keep
**Status:** Draft
**New — keep's side of the routes [ADR 0041](../../adrs/0041-keep-api-surface.md)/
[ADR 0052](../../adrs/0052-keep-herald-own-signet-access.md)/
[ADR 0060](../../adrs/0060-activity-feed-and-revenue-summary.md)/
[ADR 0071](../../adrs/0071-self-service-widget-data-access.md) already specify.**
Per [ADR 0052](../../adrs/0052-keep-herald-own-signet-access.md),
[ADR 0054](../../adrs/0054-web-billing-and-communications-screens.md),
[ADR 0060](../../adrs/0060-activity-feed-and-revenue-summary.md),
[ADR 0071](../../adrs/0071-self-service-widget-data-access.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `subscription`/`stripe-config` sections,
[tower Story 010](../tower/010-activity-feed.md)'s event-stream-construction approach (reused
here, not re-derived).

---

## `GET /me/subscription`

- [ ] Resolves the caller's own `accountId` from the forwarded internal JWT — no `tenantSlug`/
      `accountId` in the URL, same self-resolving shape as tower's own `/me/*` family (ADR 0071).
      Reached exclusively via portcullis's `/_authstar/me/subscription` proxy, never called by a
      browser directly.
- [ ] Response: `{ status, planName, currentPeriodEnd }` — resolves the caller's own
      account-scoped `subscription` (Story 001) and joins `planName` from the matching
      `planMapping` server-side, so the widget never needs `stripePriceId` (an internal
      implementation detail with no reason to leave keep) to display a human-readable plan name.
- [ ] No subscription found for this account → `{ status: null, planName: null,
      currentPeriodEnd: null }`, not a `404` — "no active subscription" is a normal, expected
      state for the account-summary widget to render around, not an error condition.

---

## `GET`/`PATCH /tenants/{tenantSlug}/stripe-config`

- [ ] Gated by `billing:manage`. `GET` never returns `stripeSecretKey`/`stripeWebhookSecret` —
      write-only, same discipline as every other secret in this design (Story 001).
- [ ] `PATCH` **validates the key at set time** with a cheap Stripe API call (e.g. a balance
      retrieve) before accepting it — rejects a bad key immediately rather than silently storing
      it and only discovering it's broken on the tenant's first real checkout or webhook (ADR
      0054). The validation call's result (not just "a key is present") is what `web`'s
      connection-health indicator reflects.
- [ ] On success, pushes both secrets directly to keep's **own** signet bundle via `SyncBundle`,
      using keep's own narrow `GitOpsService`-scoped admin token (ADR 0052) — never routed
      through tower, since keep (unlike portcullis) has its own admin API to receive the write
      directly.

---

## `GET /tenants/{tenantSlug}/activity`

- [ ] Gated by `activity:read` — the same shared `{ timestamp, actorType, actorId, eventType,
      summary }` shape tower's and herald's own `/activity` routes use (ADR 0060), so `web`
      renders all three with one component.
- [ ] Built the same way [tower Story 010](../tower/010-activity-feed.md) designed its own feed:
      discover this tenant's relevant actor ids per type (`customer`, `planMapping`,
      `subscription`, `trial`, `coupon`, `refund`, `dispute` — all carry `tenant` in
      `searchableBy`, Story 001, so each is a `find()`), then one `getEventStream` call across
      all of them, mapped through a per-event-type summary formatter (e.g. `dispute.created` →
      `"Dispute opened for {amount} {currency}"`). Not re-derived in full here — same mechanism,
      different actor-type list.
- [ ] Webhook-driven writes (Story 002) produce activity entries exactly like admin-initiated
      ones — a `charge.dispute.created` webhook is just as real an event as an admin creating a
      `trial` by hand; the feed doesn't distinguish origin.

---

## Not Covered Here

- Keep never gets an operator-only tier — confirmed in
  [tower Story 013](../tower/013-operator-api.md)'s research and ADR 0046's own text ("`keep`
  needs no operator tier at all"); nothing in this story or any other keep story needs one.
