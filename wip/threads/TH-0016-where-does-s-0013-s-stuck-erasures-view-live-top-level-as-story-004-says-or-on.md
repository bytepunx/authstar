---
id: TH-0016
title: "Where does S-0013's Stuck Erasures view live: top-level as story 004 says, or on the tenant page?"
anchor:
  path: wip/kanban/stories/S-0013-steward-shows-tenant-activity-and-stuck-erasure-requests.md
  item: S-0013
status: open
participants: [planner-S-0013]
created: 2026-11-06T18:07:28Z
updated: 2026-11-06T18:07:28Z
---

# TH-0016 Where does S-0013's Stuck Erasures view live: top-level as story 004 says, or on the tenant page?

On wip/kanban/stories/S-0013-steward-shows-tenant-activity-and-stuck-erasure-requests.md.

## Entries

### 2026-11-06T18:07:28Z planner-S-0013
S-0013's goal points to `design/stories/steward/004-activity-and-stuck-erasure-requests.md`, but criterion 1 contradicts it. The criterion puts a Stuck Erasures section on `/tenants/[slug]`. Story 004 says the view is "**not** reached from within a single tenant's operator context". It calls it a top-level view beside Tenant Search, with a threshold input that defaults to 72, and rows grouped by the missing service. Tower's `GET /operator/erasure-requests/stuck` is cross-tenant (`tower/src/routes/operator.ts:85`).

**Recommended: A.** A top-level `/erasure-requests/stuck` view, linked from steward's header nav. It has the threshold input (default 72), lists tenant, contactId, requestedAt, and the services still outstanding, and groups the rows by missing service. You would reword criterion 1 so that its Stuck Erasures half names this view. I cannot edit a finalized story's words. The reason for A: one service that stops consuming its queue stalls requests in every tenant, so a per-tenant section hides the pattern an operator needs to see.

**B.** A Stuck Erasures section on `/tenants/[slug]`, as criterion 1 says. Steward filters tower's cross-tenant list to that tenant and uses a fixed 72-hour threshold. Story 004 would be updated to say so.

**C.** Both: the top-level view from A, plus a per-tenant section from B.

I am drafting the tasks that do not depend on this answer now: the client contract, the fake tower, the activity proxy and section, and the stuck-erasure proxy. I will write the stuck view's task once you answer.
