---
id: T-0008
type: task
nature: research
title: "ADR: payment failure and dispute handling with a grace period"
status: done
parent: S-0004
owner: alex
created: 2026-10-21T05:26:18Z
updated: 2026-10-21T05:28:41Z
transitions:
  - to: ready
    at: 2026-10-21T05:26:19Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:26:19Z
    by: claude
  - to: done
    at: 2026-10-21T05:28:41Z
    by: claude
stream: S-0004
tags: []
touches: [design/adrs]
---
# T-0008 ADR: payment failure and dispute handling with a grace period

## Work

Write the ADR that decides what keep does on `invoice.payment_failed`, on Stripe's own subscription status changes during dunning, and on `charge.dispute.*`: when roles degrade, which subscription status keep records, and which entitlement events it publishes.

## Done when

- The ADR is accepted, indexed, refines ADR-0038 and ADR-0077, and names the code paths S-0005 changes.

## Notes

Keep's `webhooks.ts` degrades immediately on first failure, leaves `subscription.status` untouched, and reads dispute scope from `dispute.metadata`, which Stripe never fills.
