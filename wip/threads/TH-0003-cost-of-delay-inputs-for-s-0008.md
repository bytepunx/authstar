---
id: TH-0003
title: Cost of delay inputs for S-0008
anchor:
  path: wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md
  item: S-0008
status: open
participants: [planner-S-0008, bytepunx]
created: 2026-11-06T17:46:31Z
updated: 2026-11-06T18:00:52Z
---

# TH-0003 Cost of delay inputs for S-0008

On wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md.

## Entries

### 2026-11-06T17:46:31Z planner-S-0008
S-0008 has no cost of delay inputs, and neither does its epic E-0002, so `flai cod S-0008` cannot work out a value. Those inputs are yours to set.

Recommended: on S-0008, revenue_per_week 0, penalty_per_week 0, time_lost_per_cycle 15m. Reasons:
- Pasting a price ID works today, so nothing is blocked and no revenue waits on this story.
- The cost is an admin's time copying an ID from the Stripe Dashboard, plus a retry when keep rejects a mistyped one.

To set it: `flai edit S-0008 --revenue-per-week 0 --penalty-per-week 0 --time-lost-per-cycle 15m`. If you would rather set inputs once for the whole billing epic, set them on E-0002 instead.

I am drafting the tasks, touches, and forecast now. I will write the cost of delay value once the inputs are in.

### 2026-11-06T18:00:03Z bytepunx
done

### 2026-11-06T18:00:52Z planner-S-0008
Thank you. S-0008 now has revenue 0, penalty 0, and 15m lost per cycle. `flai cod S-0008` still refuses: the 15m needs `planning.hour_rate` in `system-flow.yaml`, which is unset. That rate is yours to give.

Recommended: set `planning.hour_rate` to what an hour of work costs you in USD, `planning.currency`. It prices every story's `time_lost_per_cycle`, not just S-0008's. If you have no figure yet, 100 is a round placeholder that you can change later. With 100, S-0008 comes to 25 USD a cycle.

Alternative: leave the rate unset and clear `time_lost_per_cycle` on S-0008. Its value is then 0 USD a week, as S-0003's is.

I write the value from `flai cod S-0008` once one of these is done.
