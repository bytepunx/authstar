---
id: T-0080
type: task
nature: remediation
title: Disputes resolve their scope through the charge, not dispute metadata
status: backlog
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:10:33Z
updated: 2026-11-06T18:10:33Z
transitions: []
stream: S-0005
tags: [keep, billing]
touches: [keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/src/actors/dispute_actor.ts, keep/src/routes/webhooks.ts, keep/spec/behavior/webhooks.spec.ts, keep/spec/behavior/webhook-disputes.spec.ts, keep/spec/e2e/trial-and-dispute-lifecycle.spec.ts]
after: [T-0076]
---
# T-0080 Disputes resolve their scope through the charge, not dispute metadata

## Work

Carry ADR-0107's dispute rule. `StripeClient` in `lib/stripe-client.ts` gains a charge read, and the fake in `keep/spec/lib/fake-stripe-client.ts` gains the same read.

On `charge.dispute.created`, keep retrieves the charge by `dispute.charge` and takes its `customer`. It then finds keep's customer record by `{tenant, stripeCustomerId}` and uses that record's scope. When no customer record exists, keep records the dispute with no subscription and changes no entitlement. `dispute.metadata` is no longer read.

The dispute record in `dispute_actor.ts` stores the resolved scope and the subscription it degraded. The degrade and restore use the helper T-0076 adds, so they publish only on a real change. `charge.dispute.closed` with `won` restores only the subscription the dispute degraded. `lost` changes nothing but the dispute's status.

Waits for T-0076, for the degrade and restore helper and the files they share.

## Done when

- `keep/spec/behavior/webhook-disputes.spec.ts` asserts each of these:
  - A dispute whose metadata is empty degrades the subscription of the charge's customer.
  - `won` restores it.
  - `lost` publishes nothing.
  - A dispute on an unknown customer is recorded and publishes nothing.
  - A dispute on a subscription already `degraded` publishes nothing.
- `grep -n metadata keep/src/routes/webhooks.ts` finds no dispute scope read
- `keep/spec/e2e/trial-and-dispute-lifecycle.spec.ts` passes with metadata-free disputes
- Keep's behavior and e2e tests pass

## Notes
