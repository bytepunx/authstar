---
id: S-0004
type: story
nature: research
title: Decide the billing semantics keep and tower share
status: ready
parent: E-0002
owner: alex
created: 2026-10-21T05:13:11Z
updated: 2026-10-21T05:13:56Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
tags: []
---
# S-0004 Decide the billing semantics keep and tower share

## Goal

Three ADRs settle what the 2026-10-20 audit found undecided or contradictory between keep and tower, so the code stories that follow implement one rule: what happens to a subscription's roles on `invoice.payment_failed` and on a dispute (grace period, which record changes), what `grantedRoles` means in each service, and what a tenant-scoped plan grants.

## Acceptance criteria
- [ ] An ADR decides payment-failure and dispute handling: the grace period, the subscription status keep records, and the entitlement events it publishes, with Stripe's own retry schedule as the reference
- [ ] An ADR resolves the `grantedRoles` collision: tower's baseline-that-survives (ADR-0018) versus keep's plan-mapping field that is revoked, with the names each service uses from now on
- [ ] An ADR decides what a `{tenant}`-scoped subscription grants and how tower materializes it, or records that tenant-scoped plans are out of scope
- [ ] `design/system/overview.md` principles reflect the three decisions

## Tasks

## Notes

Evidence: `keep/src/routes/webhooks.ts` revokes on first payment failure without changing `subscription.status`; dispute scope is read from `dispute.metadata.scope`, which Stripe does not copy from checkout metadata; `tower/src/lib/entitlement-consumer.ts` returns early on a role grant with no account id; `tower/src/actors/account_actor.ts` treats `grantedRoles` as the surviving baseline. ADR-0038 and ADR-0077 say "degrade to grantedRoles-only".
