---
id: TH-0025
title: "Plan for S-0005: eight tasks in seven layers"
anchor:
  path: wip/kanban/stories/S-0005-keep-handles-every-stripe-event-once-and-records-what-it-decides.md
  item: S-0005
status: resolved
participants: [planner-S-0005, agent-S-0005, bytepunx]
created: 2026-11-06T18:11:39Z
updated: 2026-11-13T12:08:12Z
---

# TH-0025 Plan for S-0005: eight tasks in seven layers

On wip/kanban/stories/S-0005-keep-handles-every-stripe-event-once-and-records-what-it-decides.md.

## Entries

### 2026-11-06T18:11:39Z planner-S-0005
S-0005 now has eight backlog tasks, touches named file by file, and a 4h forecast. The cost of delay value waits on TH-0019.

## Tasks and layers

| Layer | Task | What | Waits for |
|-------|------|------|-----------|
| 1 | T-0062 | ADR-0108: `planMapping.roles`, with `grantedRoles` as an input alias | none |
| 1 | T-0064 | ADR-0107: `paymentFailureAttempts` in stripe-config, default 3 | none |
| 2 | T-0070 | ADR-0109: refuse the `{tenant}` scope, publish none, one-off report | T-0062 |
| 3 | T-0073 | Full `SubscriptionStatus`, status mirrored on every event, one period-end shape | T-0070 |
| 4 | T-0076 | Grace threshold, `entitlement` state, `invoice.paid` restore | T-0064, T-0073 |
| 5 | T-0080 | Dispute scope through the charge | T-0076 |
| 6 | T-0083 | Processed `event.id` record; a redelivery answers 200 and publishes nothing | T-0080 |
| 7 | T-0084 | `keep/TESTING.md`, the live tier, `docs/operators/index.md` | T-0083 |

Six tasks change `keep/src/routes/webhooks.ts`, so they form a chain. Only T-0064 runs alongside them. The idempotency guard comes last so that its test replays every handler in its final form.

## Assumptions

- The thread the orchestrator named in my start prompt does not exist: `flai thread show asked` finds nothing, and S-0005 had no thread and no earlier plan. I planned it fresh.
- ADR-0107, ADR-0108, and ADR-0109 exist only on `origin/story/S-0004`, not on main (I-0004). The tasks cite them and digest D-0002 to D-0004. S-0005's agent needs them on main, or must read them from that branch.
- Where the threshold is stored is left to T-0064, because the signet store holds only secrets. Its agent records the choice.
- The live tier needs Stripe test keys. If S-0005's agent has none, T-0084 leaves criterion 5 unticked and says why.

## Proposals

1. **Merge `origin/story/S-0004` into main before S-0005 is pulled.** Recommended. Otherwise its agent works from ADRs that main does not have.
2. **Split T-0062 and T-0070 into a story of their own.** Optional. ADR-0108 and ADR-0109 are named in the story's Notes but in none of its criteria. They add two layers and about 20 files. If you would rather keep S-0005 to its five criteria, say so, and I will draft that story. Until then they stay as tasks here.
3. **Web reads `grantedRoles` from keep today.** After T-0062, keep returns only `roles`, and S-0008 owns web's form. Confirm that S-0008 switches web to `roles`. If it does not, T-0062 should return both fields until web does.

### 2026-11-10T03:12:21Z agent-S-0005
S-0005's agent takes the plan as drafted: eight tasks in seven layers, T-0062 and T-0064 together first, then T-0070, T-0073, T-0076, T-0080, T-0083, T-0084 in turn. The narrative's Decisions record the layers. The cost of delay inputs were set from TH-0019 (D-0025).

Source: design/digest/D-0025-cost-of-delay-inputs-for-s-0005-set-on-story-as-recommended.md

### 2026-11-13T12:08:12Z bytepunx
Resolved: S-0005 was accepted
