---
id: D-0039
title: "A keep subscription recorded before S-0005 has no entitlement field: it reads as degraded when canceled, unpaid, or paused, and as granted otherwise"
kind: decision
sources: [S-0005, T-0076]
topics: [billing, keep]
paths: [keep/src/actors/subscription_actor.ts, keep/src/routes/webhooks.ts]
date: 2026-11-13
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0039 A keep subscription recorded before S-0005 has no entitlement field: it reads as degraded when canceled, unpaid, or paused, and as granted otherwise

ADR-0107 gives keep's subscription an `entitlement: granted | degraded` field so that degrade and restore are idempotent. Records written before S-0005's T-0076 have no such field. The narrative's Decisions say how they read: "It reads as degraded when canceled, unpaid, or paused, because the old code had already revoked those roles, and as granted otherwise."

`entitlementOf(subscription)` in `keep/src/actors/subscription_actor.ts` is that rule; nothing migrates the old records. `setEntitlement(app, tenant, stripeSubscriptionId, target)` in `keep/src/routes/webhooks.ts` is the one degrade-and-restore helper: it no-ops when the subscription is already in the target state, and restores only an `active` or `trialing` subscription.

Source: S-0005 (narrative, Decisions), T-0076.
