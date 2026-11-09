---
id: D-0024
title: "Cost of delay inputs for S-0014: set as recommended"
kind: answer
sources: [TH-0018]
topics: [billing, tower, testing, keep, node, steward, sveltekit, code, all]
paths: [tower/src/lib/entitlement-consumer.ts, tower/src/server.ts, tower/spec/behavior/entitlement-consumer.spec.ts, tower/src/actors/tenant_actor.ts, tower/spec/behavior/tenants.spec.ts, steward/src/lib/types.ts, tower/spec/e2e/tenant-provisioning-and-login.e2e.spec.ts, tower/TESTING.md, keep/TESTING.md, design/stories/tower/001-actor-definitions.md, design/stories/tower/011-tenant-management-and-key-rotation.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0024 Cost of delay inputs for S-0014: set as recommended

The operator took the planner's recommended cost of delay inputs for S-0014 and set them on the story, the same as S-0008's in E-0002: `revenue_per_week` 0, `penalty_per_week` 0, `time_lost_per_cycle` 15m (set by alex at 2026-11-06T18:21:56Z).

The planner's reason, on TH-0018: no paying tenant waits on it; until it lands, a misrouted scope-less role event costs a debugging session, not revenue.

The operator answered at 2026-11-06T18:22:04Z: "set as recommended".

Source: TH-0018.
