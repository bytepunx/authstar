---
id: E-0002
type: epic
nature: feature
title: Billing end to end, with loci as the first paying tenant
status: in-progress
owner: alex
created: 2026-10-21T05:12:30Z
updated: 2026-10-21T05:29:21Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:25:51Z
    by: claude
tags: []
usage:
  source: sum
  seconds: 17406
  priced_by: harness
  turns:
    - day: 2026-11-06
      ceremony: 6
      hand_edits: 5
      work: 110
    - day: 2026-11-09
      ceremony: 8
      test_runs: 3
      hand_edits: 3
      work: 219
    - day: 2026-11-10
      ceremony: 10
      hand_edits: 10
      work: 190
  models:
    - model: claude-opus-5-5
      input: 1958
      output: 536098
      cache_read: 230034050
      cache_write: 6687225
      cost: 99.9397
  strategic:
    - kind: orchestrator
      seconds: 513
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 297
          output: 2116
          cache_read: 8254443
          cache_write: 1353284
          cost: 11.2291
---
# E-0002 Billing end to end, with loci as the first paying tenant

## Outcome

A tenant can connect its Stripe account, map prices to roles, send a user through checkout from a hosted upgrade page, and see the resulting subscription in the self-service widget; keep handles every webhook exactly once; and the semantics keep and tower apply on payment failure, dispute, and tenant-scoped plans are decided and recorded. `loci` migrates its Stripe billing onto keep as the acceptance case (`bytepunx/authstar-keep#1`, `bytepunx/authstar-tower#3`).

## Stories
- S-0004 Decide the billing semantics keep and tower share
- S-0005 Keep handles every Stripe event once and records what it decides
- S-0006 Serve GET /_authstar/me/subscription for the subscription-status widget
- S-0007 Hosted upgrade page that starts a Stripe checkout
- S-0008 Plan-mapping editor picks from the tenant's live Stripe prices
- S-0014 Tower retires the tenant entitlement scope

## Notes

From the 2026-10-20 audit: keep implements checkout, portal, plan mappings, trials, coupons, usage credentials, read-only billing views, and signature-verified webhooks, but nothing in web or steward calls checkout or portal sessions; the hosted upgrade page (ADR-0065) and `GET /me/subscription` (story keep/006) do not exist; webhooks have no event-id dedup; `invoice.payment_failed` revokes roles while keep's record stays `active`; dispute scope is read from metadata Stripe never copies; tenant-scoped role grants are dropped by tower; and `grantedRoles` means opposite things in keep and tower. The semantics stories come first.
- 2026-10-21T05:13:56Z: moved to ready: follows S-0004, which moved to ready
- 2026-10-21T05:25:51Z: moved to in-progress: follows S-0004, which moved to in-progress
