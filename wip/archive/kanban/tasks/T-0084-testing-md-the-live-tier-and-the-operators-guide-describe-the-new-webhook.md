---
id: T-0084
type: task
nature: remediation
title: TESTING.md, the live tier, and the operators guide describe the new webhook handling
status: done
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:10:55Z
updated: 2026-11-10T04:45:17Z
transitions:
  - to: ready
    at: 2026-11-10T04:34:35Z
    by: agent-S-0005
  - to: in-progress
    at: 2026-11-10T04:34:35Z
    by: agent-S-0005
  - to: done
    at: 2026-11-10T04:45:17Z
    by: agent-S-0005
stream: S-0005
tags: [keep, billing, docs]
touches: [keep/TESTING.md, keep/spec/live/stripe-live.spec.ts, docs/operators/index.md]
after: [T-0083]
usage:
  source: log
  seconds: 642
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 62
      output: 24571
      cache_read: 7653285
      cache_write: 334029
      cost: 3.8251
---
# T-0084 TESTING.md, the live tier, and the operators guide describe the new webhook handling

## Work

In `keep/TESTING.md`, describe the new tests in its covered section:

- the idempotency test in `webhook-redelivery.spec.ts`: what it replays, and why it counts publishes;
- the grace-period and dispute specs;
- the fake's charge read.

Retire whatever it says about the immediate revoke or the metadata scope.

In `docs/operators/index.md`, describe the tenant setting `paymentFailureAttempts`: its default, its effect, and how a tenant sets it. Add it to the settings index the documentation convention asks for.

Run keep's opt-in live tier (`keep/spec/live/stripe-live.spec.ts`) against Stripe test mode. Add a live check that the charge read returns the charge's `customer` when the test account can make one cheaply. If the tier cannot run here for want of Stripe test keys, leave criterion 5 unticked and say why in the story's Notes.

Waits for T-0083: it documents the finished behavior of every task before it.

## Done when

- `keep/TESTING.md` names `webhook-redelivery.spec.ts` and says what it asserts
- `docs/operators/index.md` documents `paymentFailureAttempts`
- The live tier passes, or the story's Notes say why it could not run
- `flai test` on the changed paths passes, the markdown lint included

## Notes
