---
id: S-0005
type: story
nature: remediation
title: Keep handles every Stripe event once and records what it decides
status: done
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-11-13T12:08:12Z
transitions:
  - to: ready
    at: 2026-11-09T20:44:51Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-10T03:11:27Z
    by: agent-S-0005
  - to: review
    at: 2026-11-10T04:54:03Z
    by: agent-S-0005
  - to: done
    at: 2026-11-13T12:08:12Z
    by: bytepunx
tags: []
topics: [billing, keep]
touches: [keep/src/routes/webhooks.ts, keep/src/actors/subscription_actor.ts, keep/src/actors/dispute_actor.ts, keep/src/actors/plan_mapping_actor.ts, keep/src/actors/customer_actor.ts, keep/src/actors/trial_actor.ts, keep/src/actors/refund_actor.ts, keep/src/actors/stripe_event_actor.ts, keep/src/lib/scope.ts, keep/src/lib/stripe-client.ts, keep/src/lib/stripe-config.ts, keep/src/lib/signet-stripe-config-store.ts, keep/src/lib/entitlement-publisher.ts, keep/src/routes/stripe-config.ts, keep/src/routes/plan-mappings.ts, keep/src/routes/checkout-sessions.ts, keep/src/routes/trials.ts, keep/src/routes/coupons.ts, keep/src/report-tenant-scope.ts, keep/package.json, keep/spec/lib/fake-stripe-client.ts, keep/spec/behavior/webhooks.spec.ts, keep/spec/behavior/webhook-redelivery.spec.ts, keep/spec/behavior/webhook-grace-period.spec.ts, keep/spec/behavior/webhook-disputes.spec.ts, keep/spec/behavior/stripe-config.spec.ts, keep/spec/behavior/signet-stripe-config-store.spec.ts, keep/spec/behavior/plan-mappings.spec.ts, keep/spec/behavior/checkout-sessions.spec.ts, keep/spec/behavior/trials.spec.ts, keep/spec/behavior/coupons.spec.ts, keep/spec/behavior/report-tenant-scope.spec.ts, keep/spec/integration/plan-mappings.integration.spec.ts, keep/spec/e2e/subscription-lifecycle.spec.ts, keep/spec/e2e/trial-and-dispute-lifecycle.spec.ts, keep/spec/live/stripe-live.spec.ts, keep/TESTING.md, docs/operators/index.md, docs/users/index.md, keep/spec/behavior/consequent-sequence-provider.spec.ts, design/issues/I-0021-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md, design/issues/summary.md, keep/src/lib/consequent-sequence-provider.ts, design/stories/keep/002-stripe-webhook-handling.md]
after: [S-0004]
usage:
  source: log
  seconds: 6174
  priced_by: harness
  turns:
    - day: 2026-11-10
      hand_edits: 6
      work: 79
  models:
    - model: claude-opus-5-5
      input: 536
      output: 212272
      cache_read: 66117766
      cache_write: 2885725
      cost: 33.0459
  strategic:
    - kind: orchestrator
      seconds: 101
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 60
          output: 407
          cache_read: 1692189
          cache_write: 342389
          cost: 2.3051
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 0
    time_lost_per_cycle: 30m
    by: alex
    at: 2026-11-06T18:22:14Z
forecast:
  duration: 4h
  delivery: 2026-11-10T17:51:00Z
  basis: "Its own forecast of 4h; 1st in the pull order with an in-progress limit of 4, behind S-0006, S-0007, S-0008 and S-0013."
  by: flai
  at: 2026-11-10T00:03:32Z
---
# S-0005 Keep handles every Stripe event once and records what it decides

## Goal

A redelivered or duplicated Stripe event changes nothing and publishes nothing a second time, payment failure and dispute handling follow the ADRs from S-0004, and keep's subscription record always says what tower has been told.

## Acceptance criteria
- [x] Keep records processed Stripe `event.id`s and a redelivered event returns 200 without re-running handlers or publishing; a behavior test asserts the publish count
- [x] `invoice.payment_failed` and dispute events apply the grace period and status transitions the ADR decides, and the subscription actor's status reflects them
- [x] Dispute handling resolves scope from the charge or subscription, not from dispute metadata
- [x] `SubscriptionStatus` covers every status Stripe can send
- [x] Behavior, e2e, and the opt-in live tier pass; `keep/TESTING.md` describes the idempotency test

## Tasks
- T-0062 Plan mappings call their roles roles and accept grantedRoles as an alias
- T-0064 Tenant stripe-config holds paymentFailureAttempts, default 3
- T-0070 Keep refuses the tenant scope and publishes no event with it
- T-0073 The subscription record mirrors every Stripe status and keeps one period-end shape
- T-0076 Payment failure degrades plan roles only at the grace threshold, and invoice.paid restores them
- T-0080 Disputes resolve their scope through the charge, not dispute metadata
- T-0083 Keep handles each Stripe event id once and answers a redelivery 200
- T-0084 TESTING.md, the live tier, and the operators guide describe the new webhook handling
- T-0135 Story 002's event table describes ADR-0107's webhook rules and idempotency

## Notes

`keep/src/routes/webhooks.ts`, `keep/src/actors/subscription_actor.ts`, `keep/spec/behavior/webhooks.spec.ts`. The checkout path re-wraps the subscription's `current_period_end` into a fake top-level field after `getSubscription` normalizes it; one shape should remain.

The ADRs this story implements, recorded by S-0004: ADR-0107 (status mirror, `paymentFailureAttempts` threshold, `entitlement` state on the subscription, `invoice.paid` restore, dispute scope via the charge), ADR-0108 (`planMapping.roles` with `grantedRoles` accepted as an input alias), ADR-0109 (keep refuses `{tenant}` scope and publishes none).

### Planning

`after: S-0004`: this story builds on the decisions S-0004 wrote, ADR-0107, ADR-0108, and ADR-0109 (digest D-0002, D-0003, D-0004). On 2026-11-06 those three ADRs exist only on `origin/story/S-0004`; main lacks them (I-0004). Merge that branch before this story is pulled, or read them there.

Touches, file by file, no folders:

| Source | Paths |
|--------|-------|
| Declared in the Notes | `keep/src/routes/webhooks.ts`, `keep/src/actors/subscription_actor.ts`, `keep/spec/behavior/webhooks.spec.ts` |
| Design: ADR-0107's Consequences | `keep/src/routes/stripe-config.ts`, `keep/spec/lib/fake-stripe-client.ts`, `keep/TESTING.md`, `docs/operators/index.md` |
| Design: ADR-0108 | `keep/src/actors/plan_mapping_actor.ts`, `keep/src/routes/plan-mappings.ts`, `docs/users/index.md` |
| Design: ADR-0109 | `keep/src/lib/scope.ts`, the actors' scope types (`customer_actor.ts`, `dispute_actor.ts`, `trial_actor.ts`, `refund_actor.ts`), `keep/src/routes/checkout-sessions.ts`, `trials.ts`, `coupons.ts`, the one-off report `keep/src/report-tenant-scope.ts` and its `keep/package.json` script |
| Co-change (`flai touches suggest`) | `keep/TESTING.md` (55%), `keep/src/lib/entitlement-publisher.ts` (45%, the `converted-to-paid` envelope), `keep/src/routes/trials.ts` (45%), `keep/spec/behavior/plan-mappings.spec.ts` (36%), `keep/spec/integration/plan-mappings.integration.spec.ts` (27%), `keep/src/routes/checkout-sessions.ts`, `keep/src/routes/coupons.ts` (27%) |
| Layout | `keep/src/lib/stripe-client.ts` (`getSubscription`, a new charge read), `keep/src/lib/stripe-config.ts` and `keep/src/lib/signet-stripe-config-store.ts` (the threshold's storage), the new `keep/src/actors/stripe_event_actor.ts`, new behavior specs per concern, the two e2e specs, and `keep/spec/live/stripe-live.spec.ts` |

Left out of the co-change list: `build-app.ts`, `server.ts`, `test-app.ts`, and `package-lock.json`. Consequent loads actors from the `actors` folder by file name, so a new actor needs no registration. A task widens its touches if one of these turns out to change.

The web side of ADR-0108, its plan-mapping form and `web/src/lib/server/clients/keep.ts`, is S-0008's, as ADR-0108 says. This story's touches stop at keep and the docs.

Forecast: 4h, adjusted from flai's 1h. flai had no history: only one story done with usage, a docs-only research story, so it fell back to `planning.default_duration`. The 4h counts eight tasks in seven layers. Six of them change `webhooks.ts`, so they run one after another. Delivery 2026-11-07T17:00Z: the story sits behind S-0006, S-0008, S-0009, S-0011, and S-0007 in the pull order, with an in-progress limit of 4.

Cost of delay: no value is written yet. Neither S-0005 nor E-0002 has inputs, and TH-0019 asks the operator for them.
