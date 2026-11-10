---
id: S-0013
type: story
nature: feature
title: Steward shows tenant activity and stuck erasure requests
status: in-progress
parent: E-0004
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-11-09T21:21:36Z
transitions:
  - to: ready
    at: 2026-11-09T20:44:54Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-09T20:44:59Z
    by: agent-S-0013
blocked:
  - from: 2026-11-09T21:21:36Z
    reason: awaiting the operator on TH-0016
tags: [steward]
touches: [steward/src/lib/server/tower-client.ts, steward/src/lib/types.ts, steward/tests/helpers/fake-backend-server.ts, steward/tests/integration/api-wire.integration.spec.ts, "steward/src/routes/api/tenants/[slug]/activity/+server.ts", steward/tests/behavior/activity.spec.ts, steward/src/routes/api/erasure-requests/stuck/+server.ts, steward/tests/behavior/stuck-erasure-requests.spec.ts, "steward/src/routes/tenants/[slug]/+page.svelte", steward/tests/e2e/tenant-activity.spec.ts, steward/TESTING.md, design/stories/steward/004-activity-and-stuck-erasure-requests.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
usage:
  source: log
  seconds: 2198
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 2
      hand_edits: 2
      work: 31
  models:
    - model: claude-opus-5-5
      input: 202
      output: 48516
      cache_read: 13517421
      cache_write: 452687
      cost: 6.519
  strategic:
    - kind: orchestrator
      seconds: 64
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 43
          output: 354
          cache_read: 1247012
          cache_write: 235797
          cost: 1.7056
cost_of_delay:
  value: 23.53
  by: planner-S-0013
  at: 2026-11-06T18:36:38Z
forecast:
  duration: 4h
  delivery: 2026-11-10T09:22:00Z
  basis: "Its own forecast of 4h; 4th in the pull order with an in-progress limit of 4, behind S-0006, S-0008, S-0007, S-0005 and S-0010."
  by: flai
  at: 2026-11-09T20:44:27Z
---
# S-0013 Steward shows tenant activity and stuck erasure requests

## Goal

Operators see what story steward/004 specifies: a tenant's cross-service activity feed and the erasure requests that have stalled, using the client methods steward already has.

## Acceptance criteria
- [ ] `/tenants/[slug]` gains an Activity section backed by `getActivity` and a Stuck Erasures section backed by `getStuckErasureRequests`
- [ ] Both sections have loading, empty, and error states consistent with the page's existing sections
- [ ] Behavior and e2e tests cover both against the fake tower

## Tasks
- T-0044 Steward's tower client and fake tower match tower's activity and stuck-erasure contracts
- T-0045 Steward proxies a tenant's activity feed at GET /api/tenants/[slug]/activity
- T-0046 Steward proxies stuck erasure requests at GET /api/erasure-requests/stuck
- T-0047 Tenant page shows an Activity section with loading, empty, and error states

## Notes

`steward/src/lib/server/tower-client.ts` has `getActivity` and `getStuckErasureRequests` with no caller; tower's activity route per ADR-0060 must exist for the feed to show anything, which the task breakdown should verify first.

### Planning

What planning found:

- Tower's routes exist. The operator activity route is at `tower/src/routes/activity.ts:72`, and the stuck route at `tower/src/routes/operator.ts:85`. Each has behavior tests in `tower/spec/behavior/`.
- Steward's client and types predate them. `getActivity` sends `sinceEventId` and `until`, but tower reads `limit` and `cursor`. Steward expects `{ items }` and `missingServices`, but tower answers `{ data, nextCursor }` and a bare array with `outstandingServices`. T-0044 corrects this.
- Steward's fake tower (`steward/tests/helpers/fake-backend-server.ts`) serves neither route. Steward has no proxy route for either.
- Criterion 1 puts Stuck Erasures on `/tenants/[slug]`. `design/stories/steward/004-activity-and-stuck-erasure-requests.md` makes it a top-level, cross-tenant view. TH-0016 asks the operator which placement to build. The stuck view's task, and the touches it adds, wait for that answer.

Touches, all from the design and the code layout, since the story declared none and `flai touches suggest` needs a starting path:

| Touch | Source | Why |
|-------|--------|-----|
| `steward/src/lib/server/tower-client.ts`, `steward/src/lib/types.ts` | design | named in the Notes; their contract is out of step with tower |
| `steward/tests/helpers/fake-backend-server.ts`, `steward/tests/integration/api-wire.integration.spec.ts` | layout | criterion 3's fake tower, and the client's wire tests |
| `steward/src/routes/api/tenants/[slug]/activity/+server.ts`, `steward/tests/behavior/activity.spec.ts` | layout | the proxy beside `accounts/+server.ts`, and its behavior test |
| `steward/src/routes/api/erasure-requests/stuck/+server.ts`, `steward/tests/behavior/stuck-erasure-requests.spec.ts` | layout | the cross-tenant proxy and its behavior test |
| `steward/src/routes/tenants/[slug]/+page.svelte`, `steward/tests/e2e/tenant-activity.spec.ts` | design | criterion 1's page, and a new e2e file kept apart from `operator-console.spec.ts` |
| `steward/TESTING.md`, `design/stories/steward/004-activity-and-stuck-erasure-requests.md` | design | TESTING.md lists story 004 as deferred, and 004 is the design this delivers |

No folder touch. No `after`: tower's routes are on main already, so no story writes what this one reads.

Figures:

- Forecast 4h, not flai's 1h. flai has 1 done story of history where it needs 3, so it fell back to `planning.default_duration`. The plan is five tasks over about 12 files, with e2e tests, which is more than an hour of agent time. The delivery is flai's play-out moved out by the 3h added.
- Cost of delay 23.53 USD a week, as `flai cod` gives it. It is S-0013's 4h share of the 17h forecast across E-0004's three open stories without inputs, applied to E-0004's 100 USD a week. That epic figure is the operator's penalty input. It moves when a sibling's forecast changes.
