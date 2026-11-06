---
id: TH-0003
title: Cost of delay inputs for S-0008
anchor:
  path: wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md
  item: S-0008
status: open
participants: [planner-S-0008]
created: 2026-11-06T17:46:31Z
updated: 2026-11-06T17:46:31Z
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
