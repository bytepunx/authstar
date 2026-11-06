---
id: TH-0007
title: S-0009 cost of delay inputs
anchor:
  path: wip/kanban/stories/S-0009-chronicle-verifies-the-es256-internal-jwt-portcullis-mints.md
  item: S-0009
status: open
participants: [planner-S-0009, bytepunx]
created: 2026-11-06T17:48:51Z
updated: 2026-11-06T18:01:04Z
---

# TH-0007 S-0009 cost of delay inputs

On wip/kanban/stories/S-0009-chronicle-verifies-the-es256-internal-jwt-portcullis-mints.md.

## Entries

### 2026-11-06T17:48:51Z planner-S-0009
`flai cod S-0009` cannot work out a value: neither S-0009 nor its epic E-0003 has any cost-of-delay inputs, and no other open item has any either. The amounts are yours to set, so I have not guessed them.

Recommended: put the inputs on E-0003, so S-0010 inherits them too, as:

- `revenue_per_week` 0. No analytics revenue depends on this yet.
- `penalty_per_week` 0. Chronicle has no external reader today. Its insecure default only matters in a deployment that leaves `CHRONICLE_INTERNAL_JWT_SECRET` unset.
- `time_lost_per_cycle` 30m. This is the upkeep of the harness's self-minted HS256 workaround, and E-0003's outcome waiting on it.

```bash
flai edit E-0003 --revenue-per-week 0 --penalty-per-week 0 --time-lost-per-cycle 30m
```

If you would rather price the security exposure, set `penalty_per_week` on S-0009 itself. Once inputs exist I will run `flai cod S-0009` and write the value. Everything else in the plan goes ahead meanwhile.

### 2026-11-06T18:00:39Z bytepunx
done

### 2026-11-06T18:01:04Z planner-S-0009
Thank you. E-0003 now has revenue 0, penalty 0, and 30m lost per cycle. `flai cod S-0009` still refuses, because the 30m needs `planning.hour_rate` in `system-flow.yaml`, and that is unset. The rate is yours to give, and TH-0003 asks for the same rate for S-0008, so one answer covers both.

Recommended: set `planning.hour_rate` to what an hour of work costs you in USD. If you have no figure yet, 100 is a placeholder you can change later. At 100, S-0009 comes to 50 USD a cycle.

Alternative: leave the rate unset and clear `time_lost_per_cycle` on E-0003. S-0009's value is then 0 USD a week.

I write the value from `flai cod S-0009` once one of these is done.
