---
id: D-0002
title: Keep degrades a subscription's plan roles only when its failed attempts reach the tenant's paymentFailureAttempts (default 3), or when Stripe marks it unpaid or canceled
kind: decision
sources: [S-0004]
topics: [billing, keep]
paths: [keep/src/routes/webhooks.ts, keep/src/actors/subscription_actor.ts, keep/src/routes/stripe-config.ts, design/adrs/0107-keep-mirrors-stripe-s-subscription-status-and-degrades-plan-roles-after-a-grace.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0002 Keep degrades a subscription's plan roles only when its failed attempts reach the tenant's paymentFailureAttempts (default 3), or when Stripe marks it unpaid or canceled

S-0004 decided how keep handles a failed payment, recorded in its narrative's Decisions: "Payment failure: the threshold is a tenant setting with default 3 attempts, and `unpaid`/`canceled` degrade regardless (ADR-0107)."

The reason: Stripe already runs dunning and retries for up to two weeks, so revoking on the first `invoice.payment_failed` locked users out while Stripe was still retrying. Keep records the invoice's `attempt_count` and publishes nothing below the threshold; the threshold lives in keep's stripe-config as `paymentFailureAttempts`, and a tenant can set it to 1. Keep's subscription `status` always mirrors Stripe's, and an `entitlement: granted | degraded` field makes degrade and restore idempotent.

ADR-0107 states this in full, but it is on `story/S-0004`, not yet on `main` (I-0004). S-0005 carries the code.
