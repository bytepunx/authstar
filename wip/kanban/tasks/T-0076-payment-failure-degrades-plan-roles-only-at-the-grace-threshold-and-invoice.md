---
id: T-0076
type: task
nature: remediation
title: Payment failure degrades plan roles only at the grace threshold, and invoice.paid restores them
status: backlog
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:10:24Z
updated: 2026-11-06T18:10:41Z
transitions: []
stream: S-0005
tags: [keep, billing]
touches: [keep/src/actors/subscription_actor.ts, keep/src/routes/webhooks.ts, keep/spec/behavior/webhooks.spec.ts, keep/spec/behavior/webhook-grace-period.spec.ts, keep/spec/e2e/subscription-lifecycle.spec.ts]
after: [T-0064, T-0073]
---
# T-0076 Payment failure degrades plan roles only at the grace threshold, and invoice.paid restores them

## Work

Carry ADR-0107's grace period and degraded state (digest D-0002). The subscription gains `entitlement: 'granted' | 'degraded'`, `lastFailedAttempt`, and `nextPaymentAttempt`.

- **Recording a failure.** On `invoice.payment_failed`, keep records the invoice's `attempt_count` and `next_payment_attempt` on the subscription. It publishes nothing while the count is below the tenant's `paymentFailureAttempts`, which T-0064 adds.
- **Degrade.** Degrade when the count reaches the threshold, or earlier when the mirrored status becomes `unpaid` or `canceled`. Also degrade on `customer.subscription.deleted` and `paused`.
- **Restore.** Restore on `invoice.paid` while the subscription is `degraded` and its status is `active` or `trialing`, and on `resumed`.
- **No-ops.** Degrade publishes `entitlement.role-revoked` for each of the plan's `roles` and sets `degraded`. Restore publishes `role-granted` for each and sets `granted`. Both are no-ops in the target state.
- **Statuses that revoke nothing.** `incomplete_expired` revokes nothing. A `canceled` subscription is revoked once and stays `degraded`.

Remove the immediate revoke on the first failure. Put degrade and restore in one helper, which T-0080's disputes reuse.

Waits for T-0064, for the threshold, and for T-0073, for the full status union and the files they share.

## Done when

- In `keep/spec/behavior/webhook-grace-period.spec.ts`, with the threshold at 3: attempts 1 and 2 publish 0 events, and attempt 3 publishes one `role-revoked` per plan role and sets `degraded`
- A later `invoice.paid` publishes one `role-granted` per role and sets `granted`
- With the threshold at 1, the first failure degrades
- `unpaid` degrades before the threshold; a second degrade trigger publishes nothing
- `invoice.paid` on a `granted` subscription publishes nothing
- The old immediate-revoke tests in `webhooks.spec.ts` are replaced; `keep/spec/e2e/subscription-lifecycle.spec.ts` passes with a failure-then-recovery path
- Keep's behavior and e2e tests pass

## Notes
