---
id: T-0083
type: task
nature: remediation
title: Keep handles each Stripe event id once and answers a redelivery 200
status: done
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:10:48Z
updated: 2026-11-10T04:34:32Z
transitions:
  - to: ready
    at: 2026-11-10T04:25:18Z
    by: agent-S-0005
  - to: in-progress
    at: 2026-11-10T04:25:18Z
    by: agent-S-0005
  - to: done
    at: 2026-11-10T04:34:32Z
    by: agent-S-0005
stream: S-0005
tags: [keep, billing]
touches: [keep/src/actors/stripe_event_actor.ts, keep/src/routes/webhooks.ts, keep/spec/behavior/webhooks.spec.ts, keep/spec/behavior/webhook-redelivery.spec.ts]
after: [T-0080]
usage:
  source: log
  seconds: 554
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 48
      output: 19158
      cache_read: 5967331
      cache_write: 260446
      cost: 2.9825
---
# T-0083 Keep handles each Stripe event id once and answers a redelivery 200

## Work

Record each processed Stripe event, keyed by tenant and `event.id`, in a new actor `keep/src/actors/stripe_event_actor.ts`. Follow the keyed-record pattern of `dispute_actor.ts`. Consequent loads actors from the folder by file name, so no registration is needed. Store the Stripe id as the record's key, not as a copied consequent event id: `customer_actor.ts` and `keep/TESTING.md` warn against copying `event.id` into actor state.

In `webhooks.ts`, after the signature check, a known `event.id` answers 200 and runs no handler. Record the id only after its handler succeeds, so that an event whose handler failed is retried when Stripe redelivers it.

This guard covers every handler, including those the earlier tasks changed, so it comes last of the code tasks. The idempotent degrade and restore from T-0076 remain as a second line, for overlapping triggers that carry different ids.

Waits for T-0080: every task before it changes `webhooks.ts`, and its test replays their events.

## Done when

- `keep/spec/behavior/webhook-redelivery.spec.ts` sends each handled event type twice with the same id, and asserts all of these:
  - Both deliveries answer 200.
  - The second runs no handler.
  - `t.publisher.published` grows by nothing on the second.
- An event whose handler throws is not recorded, and its redelivery runs the handler
- The existing redelivery test in `webhooks.spec.ts` asserts the publish count, not only the record count
- Keep's behavior and e2e tests pass

## Notes
