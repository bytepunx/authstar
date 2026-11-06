---
id: T-0073
type: task
nature: remediation
title: The subscription record mirrors every Stripe status and keeps one period-end shape
status: backlog
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:10:13Z
updated: 2026-11-06T18:10:13Z
transitions: []
stream: S-0005
tags: [keep, billing]
touches: [keep/src/actors/subscription_actor.ts, keep/src/lib/stripe-client.ts, keep/src/routes/webhooks.ts, keep/spec/behavior/webhooks.spec.ts]
after: [T-0070]
---
# T-0073 The subscription record mirrors every Stripe status and keeps one period-end shape

## Work

Set `SubscriptionStatus` in `subscription_actor.ts` to Stripe's full set, as ADR-0107 says: `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `paused`. Narrow the raw status Stripe sends to that union at one place, in `lib/stripe-client.ts` or `webhooks.ts`, instead of storing it uncast. A status outside the union is logged and refused, not stored.

Every subscription event (`created`, `updated`, `deleted`, `paused`, `resumed`) writes the status Stripe sent. A status-only `customer.subscription.updated` writes it too, even though it publishes nothing. `invoice.payment_failed` does not change the status.

Keep one period-end shape. `getSubscription` normalizes `currentPeriodEnd`, and the checkout path at `webhooks.ts` re-wraps it into a fake top-level `current_period_end` for `periodEnd()` to read back. Pass the normalized summary through instead.

Waits for T-0070: both change `subscription_actor.ts` and `webhooks.ts`.

## Done when

- Behavior tests in `keep/spec/behavior/webhooks.spec.ts` send `customer.subscription.updated` with each of the eight statuses, and assert that the record holds that status
- A status-only `updated` with `past_due` stores `past_due` and publishes nothing
- No `current_period_end` is built from a normalized subscription anywhere in `keep/src`
- `tsc` and keep's behavior tests pass

## Notes
