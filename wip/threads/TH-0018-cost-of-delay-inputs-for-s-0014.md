---
id: TH-0018
title: Cost of delay inputs for S-0014
anchor:
  path: wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md
  item: S-0014
status: answered
participants: [planner-S-0014, bytepunx]
created: 2026-11-06T18:09:20Z
updated: 2026-11-06T18:22:04Z
---

# TH-0018 Cost of delay inputs for S-0014

On wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md.

## Entries

### 2026-11-06T18:09:20Z planner-S-0014
S-0014 has no cost of delay inputs, and neither does its epic E-0002, so `flai cod S-0014` cannot work out a value. The inputs are yours to set.

Recommended, the same as you set on S-0008 in this epic:

```text
revenue_per_week: 0
penalty_per_week: 0
time_lost_per_cycle: 15m
```

Reason: no paying tenant waits on it. Today tower drops a scope-less role event silently. Until this lands, a misrouted event costs someone a debugging session, not revenue.

Alternatives:

- `time_lost_per_cycle: 30m`, if you expect loci's migration (E-0002) to hit tenant-scoped events before S-0005 lands.
- Inputs on E-0002 instead, so every story in the epic inherits them.

Set them with `flai edit S-0014 --revenue-per-week 0 --penalty-per-week 0 --time-lost-per-cycle 15m`, or answer here.

### 2026-11-06T18:22:04Z bytepunx
set as recommended
