---
id: TH-0022
title: "Plan for S-0014: four tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md
  item: S-0014
status: resolved
participants: [planner-S-0014, bytepunx]
created: 2026-11-06T18:10:49Z
updated: 2026-11-06T18:22:41Z
---

# TH-0022 Plan for S-0014: four tasks in three layers

On wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md.

## Entries

### 2026-11-06T18:10:49Z planner-S-0014
S-0014 is planned: four tasks in three layers, eleven file touches, a 3h forecast. Its cost of delay value waits on TH-0018. The run was started to re-plan, but no earlier plan or thread on S-0014 existed, so this is its first plan.

## Tasks and layers

| Layer | Task | Touches | after |
|-------|------|---------|-------|
| 1 | T-0058 Consumer logs scope-less events as malformed, drops the tenant seat branch | `tower/src/lib/entitlement-consumer.ts`, `tower/src/server.ts`, `tower/spec/behavior/entitlement-consumer.spec.ts` | none |
| 2 | T-0060 Tenant actor and steward's Tenant type lose `seatLimit` | `tower/src/actors/tenant_actor.ts`, `tower/spec/behavior/tenants.spec.ts`, `steward/src/lib/types.ts` | T-0058 |
| 2 | T-0063 E2E covers the malformed-scope log | `tower/spec/e2e/tenant-provisioning-and-login.e2e.spec.ts` | T-0058 |
| 3 | T-0068 Testing notes and tower's design stories drop the tenant seat limit | `tower/TESTING.md`, `keep/TESTING.md`, `design/stories/tower/001-actor-definitions.md`, `design/stories/tower/011-tenant-management-and-key-rotation.md` | T-0060, T-0063 |

T-0060 waits for T-0058 because the consumer calls `tenant.set-seat-limit`: removing the command first breaks tower's build. T-0063 injects the logger T-0058 adds.

## Assumptions

- A `seat-limit-changed` with no organization id is logged as malformed too, like a scope-less role event. ADR-0109 removes its tenant branch, and logging it beats a new silent drop.
- The consumer gets its logger as a dependency, passed from `tower/src/server.ts`. It has none today, and Fastify's `app.log` is built after the consumer starts.
- `steward/src/lib/types.ts`'s `Tenant.seatLimit?` counts as a client type under criterion 1, so T-0060 removes it. `clients/typescript` mentions no seat limit, so criterion 4's half about it is a check.
- `design/stories/tower/001` and `011` describe the tenant `seatLimit`, so T-0068 updates them, as the documentation convention asks.
- `after` stays S-0004 only. S-0005 is not added: S-0014 reads nothing it writes, and logging an event tower now drops silently is safe in either order.

## Risk

ADR-0109 is on `story/S-0004` (commit a789f8b), not on main (I-0004). Until that merge lands, the story's agent reads it with `git show`.

## Proposals

None to split, merge, or drop.

### 2026-11-06T18:22:41Z bytepunx
Resolved.
