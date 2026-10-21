---
id: S-0005
type: story
nature: remediation
title: Keep handles every Stripe event once and records what it decides
status: backlog
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-10-21T05:13:12Z
transitions: []
tags: []
after: [S-0004]
---
# S-0005 Keep handles every Stripe event once and records what it decides

## Goal

A redelivered or duplicated Stripe event changes nothing and publishes nothing a second time, payment failure and dispute handling follow the ADRs from S-0004, and keep's subscription record always says what tower has been told.

## Acceptance criteria
- [ ] Keep records processed Stripe `event.id`s and a redelivered event returns 200 without re-running handlers or publishing; a behavior test asserts the publish count
- [ ] `invoice.payment_failed` and dispute events apply the grace period and status transitions the ADR decides, and the subscription actor's status reflects them
- [ ] Dispute handling resolves scope from the charge or subscription, not from dispute metadata
- [ ] `SubscriptionStatus` covers every status Stripe can send
- [ ] Behavior, e2e, and the opt-in live tier pass; `keep/TESTING.md` describes the idempotency test

## Tasks

## Notes

`keep/src/routes/webhooks.ts`, `keep/src/actors/subscription_actor.ts`, `keep/spec/behavior/webhooks.spec.ts`. The checkout path re-wraps the subscription's `current_period_end` into a fake top-level field after `getSubscription` normalizes it; one shape should remain.

The ADRs this story implements, recorded by S-0004: ADR-0107 (status mirror, `paymentFailureAttempts` threshold, `entitlement` state on the subscription, `invoice.paid` restore, dispute scope via the charge), ADR-0108 (`planMapping.roles` with `grantedRoles` accepted as an input alias), ADR-0109 (keep refuses `{tenant}` scope and publishes none).
