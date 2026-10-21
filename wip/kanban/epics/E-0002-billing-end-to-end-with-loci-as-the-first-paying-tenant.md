---
id: E-0002
type: epic
nature: feature
title: Billing end to end, with loci as the first paying tenant
status: ready
owner: alex
created: 2026-10-21T05:12:30Z
updated: 2026-10-21T05:13:56Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
tags: []
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

## Notes

From the 2026-10-20 audit: keep implements checkout, portal, plan mappings, trials, coupons, usage credentials, read-only billing views, and signature-verified webhooks, but nothing in web or steward calls checkout or portal sessions; the hosted upgrade page (ADR-0065) and `GET /me/subscription` (story keep/006) do not exist; webhooks have no event-id dedup; `invoice.payment_failed` revokes roles while keep's record stays `active`; dispute scope is read from metadata Stripe never copies; tenant-scoped role grants are dropped by tower; and `grantedRoles` means opposite things in keep and tower. The semantics stories come first.
- 2026-10-21T05:13:56Z: moved to ready: follows S-0004, which moved to ready
