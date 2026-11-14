---
id: D-0037
title: "Keep stores a tenant's paymentFailureAttempts in its own signet bundle as stripe-payment-failure-attempts-<slug>, beside the Stripe secrets; an unreadable value reads as unset, so 3"
kind: decision
sources: [S-0005, T-0064]
topics: [billing, keep, signet]
paths: [keep/src/lib/stripe-config.ts, keep/src/lib/signet-stripe-config-store.ts, keep/src/routes/stripe-config.ts, docs/operators/index.md]
date: 2026-11-13
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0037 Keep stores a tenant's paymentFailureAttempts in its own signet bundle as stripe-payment-failure-attempts-<slug>, beside the Stripe secrets; an unreadable value reads as unset, so 3

S-0005's T-0064 had to choose where keep keeps the tenant setting ADR-0107 adds, `paymentFailureAttempts`. Its narrative's Decisions record the choice: "T-0064 stores `paymentFailureAttempts` as one more entry in keep's own signet bundle, `stripe-payment-failure-attempts-<slug>`, beside the two Stripe secrets."

The reason: that bundle is the only store keep's stripe-config module writes, and `server.ts` already reloads it at startup. The alternatives were rejected. Signet config would suit a non-secret better, but it needs new wiring in `server.ts`. An actor would contradict keep's Story 001, "stripe-config is not an actor".

An unreadable stored value reads as unset, so the threshold is 3. `effectivePaymentFailureAttempts(store, tenant)` in `keep/src/lib/stripe-config.ts` is the one reader, used by the stripe-config routes and the webhooks. `docs/operators/index.md` § "Keep's tenant billing settings" documents the setting for operators. A later tenant billing setting can follow the same pattern, or move both to signet config.

Source: S-0005 (narrative, Decisions), T-0064.
