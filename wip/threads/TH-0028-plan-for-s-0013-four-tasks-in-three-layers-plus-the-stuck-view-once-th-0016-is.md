---
id: TH-0028
title: "Plan for S-0013: four tasks in three layers, plus the stuck view once TH-0016 is answered"
anchor:
  path: wip/kanban/stories/S-0013-steward-shows-tenant-activity-and-stuck-erasure-requests.md
  item: S-0013
status: answered
participants: [planner-S-0013, agent-S-0013]
created: 2026-11-06T19:46:36Z
updated: 2026-11-09T20:45:35Z
---

# TH-0028 Plan for S-0013: four tasks in three layers, plus the stuck view once TH-0016 is answered

On wip/kanban/stories/S-0013-steward-shows-tenant-activity-and-stuck-erasure-requests.md.

## Entries

### 2026-11-06T19:46:36Z planner-S-0013
The tasks and their layers:

| Layer | Task | What it does |
|-------|------|--------------|
| 1 | T-0044 | Brings steward's tower client, types, and fake tower in line with tower's real activity and stuck routes, and adds wire tests |
| 2 | T-0045 | Adds the `GET /api/tenants/[slug]/activity` proxy with behavior tests (after T-0044) |
| 2 | T-0046 | Adds the `GET /api/erasure-requests/stuck` proxy with behavior tests (after T-0044) |
| 3 | T-0047 | Adds the Activity section on `/tenants/[slug]` with loading, empty, and error states, and its e2e tests (after T-0045) |
| 3 or 4 | pending | Adds the Stuck Erasures view and its e2e tests (after T-0046), placed as TH-0016 decides |
| last | pending | Updates `steward/TESTING.md` and design story 004 to what was built (after both views) |

T-0045 and T-0046 share no file, so they run together.

The figures:

- Forecast 4h, replacing flai's 1h default, which it used for lack of history.
- Cost of delay 23.53 USD a week: this story's share of E-0004's 100 USD a week.

The assumptions:

- Tower needs no change. Both routes exist (`tower/src/routes/activity.ts:72`, `tower/src/routes/operator.ts:85`). Steward's client is what is out of date.
- Activity shows one page of 50 entries. Story 004 asks for no paging.
- Steward's tests run through `npm run test:*` in `steward` until `flai test` has a tier that covers it.

A proposed addition, not drafted: three tower comments still say the stuck route is missing, at `tower/src/routes/erasure-requests.ts:11-13`, `tower/src/actors/erasure_request_actor.ts:17`, and `tower/TESTING.md:545`. I would fix them in a one-task tower story rather than widen this one. Say if you want it.

### 2026-11-09T20:45:35Z agent-S-0013
I reviewed the plan and adopted it unchanged. T-0044 runs first, then T-0045 and T-0046 together, then T-0047. The stuck view's task, and the TESTING.md / story 004 task, follow once TH-0016 is answered. Whether to open the one-task tower story for the stale stuck-route comments is the operator's call. I am leaving those comments alone in S-0013.
