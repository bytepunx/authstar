---
id: S-0014
type: story
nature: remediation
title: Tower retires the tenant entitlement scope
status: in-progress
parent: E-0002
owner: alex
created: 2026-10-21T05:29:21Z
updated: 2026-11-15T06:19:41Z
transitions:
  - to: ready
    at: 2026-11-14T10:07:01Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-14T10:07:14Z
    by: agent-S-0014
  - to: review
    at: 2026-11-14T11:10:05Z
    by: agent-S-0014
  - to: in-progress
    at: 2026-11-14T11:12:56Z
    by: flai
  - to: review
    at: 2026-11-14T11:14:43Z
    by: agent-S-0014
  - to: in-progress
    at: 2026-11-14T11:18:24Z
    by: flai
  - to: review
    at: 2026-11-14T11:20:02Z
    by: agent-S-0014
  - to: in-progress
    at: 2026-11-14T11:22:56Z
    by: flai
blocked:
  - from: 2026-11-14T11:28:27Z
    until: 2026-11-14T11:31:30Z
    reason: awaiting the operator on TH-0061
  - from: 2026-11-14T11:32:05Z
    until: 2026-11-14T11:38:53Z
    reason: awaiting the operator on TH-0061
  - from: 2026-11-14T11:39:10Z
    until: 2026-11-14T17:49:29Z
    reason: awaiting the operator on TH-0061
  - from: 2026-11-14T17:49:41Z
    until: 2026-11-14T17:50:03Z
    reason: awaiting the operator on TH-0061
  - from: 2026-11-14T17:50:15Z
    until: 2026-11-14T18:00:13Z
    reason: awaiting the operator on TH-0061
  - from: 2026-11-14T18:00:49Z
    until: 2026-11-15T06:19:09Z
    reason: awaiting the operator on TH-0061
  - from: 2026-11-15T06:19:41Z
    reason: awaiting the operator on TH-0061
tags: [tower]
topics: [billing, tower, testing]
touches: [tower/src/lib/entitlement-consumer.ts, tower/src/server.ts, tower/spec/behavior/entitlement-consumer.spec.ts, tower/src/actors/tenant_actor.ts, tower/spec/behavior/tenants.spec.ts, steward/src/lib/types.ts, tower/spec/e2e/tenant-provisioning-and-login.e2e.spec.ts, tower/TESTING.md, design/stories/tower/001-actor-definitions.md, design/stories/tower/011-tenant-management-and-key-rotation.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/I-0030-the-golden-path-logs-in-while-tower-s-signet-coordinated-restart-after.md, design/issues/I-0031-tower-stays-down-for-about-27-seconds-after-taking-its-signet-restart-lock-app.md, design/issues/I-0034-additive-bumps-to-a-shared-issue-file-raise-overlap-messages-between-every.md]
after: [S-0004]
usage:
  source: log
  seconds: 4422
  priced_by: harness
  turns:
    - day: 2026-11-14
      ceremony: 3
      hand_edits: 3
      work: 129
    - day: 2026-11-15
      ceremony: 1
      work: 2
  models:
    - model: claude-opus-5-5
      input: 386
      output: 92196
      cache_read: 41477446
      cache_write: 1122378
      cost: 18.9281
  strategic:
    - kind: orchestrator
      seconds: 202
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 102
          output: 622
          cache_read: 3072641
          cache_write: 413118
          cost: 3.9123
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 0
    time_lost_per_cycle: 15m
    by: alex
    at: 2026-11-06T18:21:56Z
forecast:
  duration: 3h
  delivery: 2026-11-16T21:21:00Z
  basis: "Its own forecast of 3h; 5th in the pull order with an in-progress limit of 4, behind S-0013, S-0012, S-0007, S-0008 and S-0010."
  by: flai
  at: 2026-11-14T09:55:08Z
---
# S-0014 Tower retires the tenant entitlement scope

## Goal

Tower implements ADR-0109: the tenant actor loses `seatLimit` and its command, the entitlement consumer logs a role event with neither account nor organization scope as malformed instead of dropping it silently, and the tenant branch of `seat-limit-changed` is gone.

## Acceptance criteria
- [x] `tower/src/actors/tenant_actor.ts` has no `seatLimit`, `set-seat-limit`, or `seat-limit-set`, and no route or SDK type references them
- [x] `tower/src/lib/entitlement-consumer.ts` logs a warning naming the event and scope for a role event with no account or organization id
- [x] Behavior and e2e tests pass and cover the malformed-scope log
- [x] `clients/typescript` types and `keep/TESTING.md` no longer mention tenant seat limits

## Tasks
- T-0058 Entitlement consumer logs scope-less events as malformed and drops the tenant seat branch
- T-0060 Tenant actor and steward's Tenant type lose seatLimit
- T-0063 End-to-end test covers the malformed-scope log
- T-0068 Testing notes and tower's design stories drop the tenant seat limit

## Notes

Breaking for any caller of `tenant.seatLimit`; the 2026-10-20 audit found none outside tower's tests. Ordered after S-0005 in practice, because keep must stop publishing tenant-scoped events first.

### Planning

Touches, file by file, and where each came from. `flai touches suggest` listed nothing, since the story declared no touches; the rest comes from ADR-0109's Consequences (design), D-0004, and an explorer's read of the code (layout).

| Touch | Source | Why |
|-------|--------|-----|
| `tower/src/lib/entitlement-consumer.ts` | design | ADR-0109: drop the tenant branch of `seat-limit-changed` (lines 141-143) and log scope-less role events, now silent returns at lines 102 and 114 |
| `tower/src/server.ts` | layout | The consumer has no logger; `startEntitlementConsumer` is called at line 152 with `{ consequent }` only |
| `tower/spec/behavior/entitlement-consumer.spec.ts` | layout | Its tenant seat test (lines 114-123) goes, and the organization test's tenant `seatLimit` assertion (line 165) is reworked |
| `tower/src/actors/tenant_actor.ts` | design | ADR-0109 and criterion 1: state field, `set-seat-limit` command, `seat-limit-set` event, and reducer |
| `tower/spec/behavior/tenants.spec.ts` | layout | `GET` and `PATCH /tenants/:slug` spread the whole state, so a test pins that `seatLimit` left the response |
| `steward/src/lib/types.ts` | layout | `Tenant.seatLimit?` (line 11) is the only client type that names it; criterion 1's "no SDK type" |
| `tower/spec/e2e/tenant-provisioning-and-login.e2e.spec.ts` | layout | Criterion 3: the only e2e that drives the consumer (line 112) |
| `tower/TESTING.md` | layout | It lists the consumer's suites (lines 184-192) |
| `keep/TESTING.md` | design | Criterion 4 names it; line 125 reads "one shared sequence per tenant/scope" |
| `design/stories/tower/001-actor-definitions.md` | layout | Describes `tenant.seatLimit` (lines 59, 108) |
| `design/stories/tower/011-tenant-management-and-key-rotation.md` | layout | Lists `seatLimit` in the tenant response (line 28) |

`clients/typescript` mentions no seat limit and has no generated code, so criterion 4's half about it is a check, not a change, and it is no touch. No folder touch is kept. The story is tagged `tower`, the component it delivers to; the steward type and keep's testing notes are follow-on edits, not deliveries.

`after`: S-0004, which wrote ADR-0109, the decision this story implements. ADR-0109 is on `story/S-0004` (commit a789f8b) and not yet on main (I-0004); the story's agent reads it there until it is merged. S-0005 is not in `after`: this story reads nothing S-0005 writes. Tower logging a tenant-scoped event as malformed, where it now drops it silently, is safe whichever lands first, so the order the note above prefers is the pull order's to set.

Plan: T-0058 first; T-0060 and T-0063 together after it; T-0068 last. The tenant actor's command stays until the consumer stops calling it, so tower builds at every commit.

Forecast: `flai forecast` gave 1h, the `planning.default_duration`, because only one done story has usage. Adjusted to 3h: four tasks in three layers across tower, steward, and documents, with logger wiring in tower's entrypoint. S-0011, with eight tasks, is forecast at 5h. Delivery 2026-11-07T02:54:00Z is flai's play of the pull order (7th, behind nine stories), started at the same point with 3h in place of 1h.

Cost of delay: no value yet. Neither S-0014 nor E-0002 has inputs, so `flai cod` cannot work one out. Asked on TH-0018.

### Verification

S-0014's agent verified every criterion from the code, a grep, and the close-out's test tier, which passed at c40f204. On 2026-11-14 the request to deploy into a kluster namespace was refused: S-0015 and S-0016 held the two namespaces `kluster.agent_namespaces` allows. No criterion needs a running cluster. Tower's consumer and actor are covered by its behavior and e2e suites, and the review's deploy checks the rest. `keep/TESTING.md` needed no edit: it names `seat-limit-changed` only for organizations, and "per tenant/scope" there is the sequence key, not the retired scope.
- 2026-11-14T11:12:56Z: moved to in-progress: flai serve's checks of S-0014 against its kluster namespace ended failed, at the check golden-path, at commit 731afd4d3456
- 2026-11-14T11:18:24Z: moved to in-progress: flai serve's checks of S-0014 against its kluster namespace ended failed, at the check golden-path, at commit ff7bb98675f2
- 2026-11-14T11:22:56Z: moved to in-progress: flai serve's checks of S-0014 against its kluster namespace ended failed, at the check golden-path, at commit 68d18872fe05
