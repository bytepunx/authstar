---
id: ADR-0107
title: "Keep mirrors Stripe's subscription status and degrades plan roles after a grace period"
status: accepted
date: 2026-10-21
supersedes: []
superseded_by: []
refines: [ADR-0038, ADR-0077]
---

# ADR-0107 Keep mirrors Stripe's subscription status and degrades plan roles after a grace period

## Context

ADR-0038 says `invoice.payment_failed` starts a grace period and that keep degrades the account to its baseline roles only after a tunable number of failed attempts; ADR-0077 reuses that degrade for `charge.dispute.created` and reverses it when the dispute is won. The code in `keep/src/routes/webhooks.ts` does neither as written: it revokes the plan's roles on the first `invoice.payment_failed`, never changes the subscription record's `status`, and resolves a dispute's scope from `dispute.metadata.scope`, which Stripe does not copy onto Dispute objects, so dispute degrade and restore never fire for real events. The `SubscriptionStatus` union omits `incomplete`, `incomplete_expired`, and `unpaid`, and raw Stripe statuses are stored uncast. Nothing records whether a subscription is currently degraded, so a redelivered event republishes every revoke and a restore can be published for a subscription that was never degraded.

Stripe already runs dunning: it marks the subscription `past_due` on the first failed payment, retries on the tenant's configured schedule (Smart Retries, up to eight attempts over up to two weeks by default), and at the end sets the subscription to `canceled` or `unpaid` according to the tenant's settings. Each failed invoice carries `attempt_count` and `next_payment_attempt`.

## Decision

Keep's subscription record always mirrors the status Stripe sends, degrades plan roles only when the grace period ends, and tracks its own degraded state.

- **Status mirrors Stripe.** `SubscriptionStatus` is Stripe's full set: `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `paused`. Every subscription event (`created`, `updated`, `deleted`, `paused`, `resumed`) writes the status Stripe sent; keep never invents a status. `invoice.payment_failed` does not change the status, because Stripe sends `customer.subscription.updated` with `past_due` alongside it.
- **Grace period.** On `invoice.payment_failed`, keep records the invoice's `attempt_count` and `next_payment_attempt` on the subscription (`lastFailedAttempt`, `nextPaymentAttempt`) and publishes nothing while `attempt_count` is below the tenant's threshold. The threshold is a tenant setting in keep's stripe-config, `paymentFailureAttempts`, default `3`. Degrade happens when `attempt_count` reaches the threshold, or earlier when the subscription's mirrored status becomes `unpaid` or `canceled`, whichever comes first. `incomplete_expired` is a subscription that never started and revokes nothing.
- **Degraded state is recorded.** The subscription gains `entitlement: 'granted' | 'degraded'`. Degrade publishes `entitlement.role-revoked` for each plan role and sets `degraded`; restore publishes `entitlement.role-granted` for each plan role and sets `granted`. Both are no-ops when the record is already in the target state, which is what makes redelivery and overlapping triggers harmless. A `canceled` subscription is revoked once and stays `degraded`.
- **Restore.** `invoice.paid` for a subscription that is `degraded` and whose mirrored status is `active` or `trialing` restores. `customer.subscription.resumed` restores; `paused` degrades. A dispute won restores only what the dispute degraded (below).
- **Disputes resolve scope through the charge.** On `charge.dispute.created`, keep retrieves the charge by `dispute.charge`, takes its `customer`, finds keep's customer record by Stripe customer id, and uses that record's scope. If no customer record exists the dispute is recorded with the tenant as scope and no entitlement changes. The dispute record stores the resolved scope and the subscription it degraded, so `charge.dispute.closed` with `won` restores that subscription and `lost` changes nothing, as ADR-0077 says. `dispute.metadata` is no longer read.
- **What a degrade revokes** is the plan mapping's roles, as ADR-0108 names them; whatever else the account or organization holds in tower survives.

## Consequences

- A tenant's users keep their access through Stripe's own retry window, as ADR-0038 intended, and a tenant can shorten it with `paymentFailureAttempts: 1`.
- Keep's record of a subscription agrees with Stripe's and with what tower has been told; `GET /me/subscription` (S-0006) can show `past_due` honestly.
- Dispute handling needs one Stripe read per dispute, which is rare.
- Code: `keep/src/actors/subscription_actor.ts` gains the fields and the full status union; `keep/src/routes/webhooks.ts` gains `invoice.paid`, loses the immediate revoke and the metadata scope read; `keep/src/routes/stripe-config.ts` gains the threshold; the fake Stripe in `keep/spec` gains `charges.retrieve`. S-0005 carries the change.
- `keep/TESTING.md` and `docs/operators/` describe the threshold.

## Alternatives considered

- Keep degrading on the first failure: the simplest code, but it locks users out while Stripe is still retrying, which ADR-0038 rejected.
- Count attempts in keep across invoices: duplicates Stripe's dunning state, which the invoice already reports in `attempt_count`.
- Degrade only on `unpaid` or `canceled`, with no threshold: honours Stripe's schedule exactly but gives a tenant no way to degrade sooner than two weeks; the threshold with a sensible default covers both.
- Walk `charge -> payment_intent -> invoice -> subscription` for disputes: more precise, more Stripe reads, and the customer scope already identifies the subscription keep degrades.
