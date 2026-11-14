---
id: D-0025
title: "Cost of delay inputs for S-0005: set on story as recommended"
kind: answer
sources: [TH-0019]
topics: [billing, keep, node, code, all]
paths: [keep/src/routes/webhooks.ts, keep/src/actors/subscription_actor.ts, keep/src/actors/dispute_actor.ts, keep/src/actors/plan_mapping_actor.ts, keep/src/actors/customer_actor.ts, keep/src/actors/trial_actor.ts, keep/src/actors/refund_actor.ts, keep/src/actors/stripe_event_actor.ts, keep/src/lib/scope.ts, keep/src/lib/stripe-client.ts, keep/src/lib/stripe-config.ts, keep/src/lib/signet-stripe-config-store.ts, keep/src/lib/entitlement-publisher.ts, keep/src/routes/stripe-config.ts, keep/src/routes/plan-mappings.ts, keep/src/routes/checkout-sessions.ts, keep/src/routes/trials.ts, keep/src/routes/coupons.ts, keep/src/report-tenant-scope.ts, keep/package.json, keep/spec/lib/fake-stripe-client.ts, keep/spec/behavior/webhooks.spec.ts, keep/spec/behavior/webhook-redelivery.spec.ts, keep/spec/behavior/webhook-grace-period.spec.ts, keep/spec/behavior/webhook-disputes.spec.ts, keep/spec/behavior/stripe-config.spec.ts, keep/spec/behavior/signet-stripe-config-store.spec.ts, keep/spec/behavior/plan-mappings.spec.ts, keep/spec/behavior/checkout-sessions.spec.ts, keep/spec/behavior/trials.spec.ts, keep/spec/behavior/coupons.spec.ts, keep/spec/behavior/report-tenant-scope.spec.ts, keep/spec/integration/plan-mappings.integration.spec.ts, keep/spec/e2e/subscription-lifecycle.spec.ts, keep/spec/e2e/trial-and-dispute-lifecycle.spec.ts, keep/spec/live/stripe-live.spec.ts, keep/TESTING.md, docs/operators/index.md, docs/users/index.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: [TH-0019, TH-0025]
---

# D-0025 Cost of delay inputs for S-0005: set on story as recommended

The operator took the planner's recommended cost of delay inputs for S-0005 and set them on the story, not on E-0002: `revenue_per_week` 0, `penalty_per_week` 0, `time_lost_per_cycle` 30m (set by alex at 2026-11-06T18:22:14Z). At `planning.hour_rate` 150 that is 75 USD a cycle.

The planner's reason, on TH-0019: checkout and the happy-path subscription already work, so no revenue waits; the cost each cycle is cleaning up after the defects, such as a user locked out on the first failed payment or a redelivered event published twice.

The operator answered at 2026-11-06T18:22:26Z: "set on story as recommended". With D-0014, D-0022, and D-0024, every E-0002 story so far carries its own inputs and the epic none.

Source: TH-0019.
