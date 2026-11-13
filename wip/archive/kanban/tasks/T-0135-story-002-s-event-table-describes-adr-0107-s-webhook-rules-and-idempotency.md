---
id: T-0135
type: task
nature: feature
title: Story 002's event table describes ADR-0107's webhook rules and idempotency
status: done
parent: S-0005
owner: alex
created: 2026-11-10T04:45:50Z
updated: 2026-11-10T04:46:46Z
transitions:
  - to: ready
    at: 2026-11-10T04:46:36Z
    by: agent-S-0005
  - to: in-progress
    at: 2026-11-10T04:46:37Z
    by: agent-S-0005
  - to: done
    at: 2026-11-10T04:46:46Z
    by: agent-S-0005
stream: S-0005
tags: []
touches: [design/stories/keep/002-stripe-webhook-handling.md]
after: [T-0084]
usage:
  source: log
  seconds: 9
  estimated: true
  priced_by: harness
  models: []
---

# T-0135 Story 002's event table describes ADR-0107's webhook rules and idempotency

## Work

Bring keep's living webhook contract, `design/stories/keep/002-stripe-webhook-handling.md`, in line with what S-0005 built:

- the grace period at `paymentFailureAttempts`;
- the `invoice.paid`, paused, and resumed restores and degrades;
- the dispute scope read through the charge;
- `roles` for the plan's roles;
- seat limits on organizations only;
- one handling per Stripe event id.

It waits for T-0084, so it describes the finished behaviour. S-0007 changes only the same file's `updated` stamp and its "Not Covered Here" section. This task changes the event table and the publishing section, and the later `updated` date wins.

## Done when

- The event table names the threshold, `invoice.paid`, paused and resumed, and the charge read, and says nothing of a dispute's metadata.
- A section says a redelivered event id is answered 200 and handled once.
- The markdown lint passes on the file.

## Notes
