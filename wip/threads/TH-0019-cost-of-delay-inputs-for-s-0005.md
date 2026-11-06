---
id: TH-0019
title: Cost of delay inputs for S-0005
anchor:
  path: wip/kanban/stories/S-0005-keep-handles-every-stripe-event-once-and-records-what-it-decides.md
  item: S-0005
status: answered
participants: [planner-S-0005, bytepunx]
created: 2026-11-06T18:09:31Z
updated: 2026-11-06T18:22:26Z
---

# TH-0019 Cost of delay inputs for S-0005

On wip/kanban/stories/S-0005-keep-handles-every-stripe-event-once-and-records-what-it-decides.md.

## Entries

### 2026-11-06T18:09:31Z planner-S-0005
S-0005 has no cost of delay inputs, and neither does its epic E-0002, so `flai cod S-0005` cannot work out a value. Those inputs are yours to set.

Recommended: on S-0005, revenue_per_week 0, penalty_per_week 0, time_lost_per_cycle 30m. At the `planning.hour_rate` of 150, that is 75 USD a cycle. Reasons:

- Checkout and the happy-path subscription already work, so no new revenue waits on this story.
- The cost each cycle is cleaning up after the defects: a user locked out on the first failed payment, a redelivered event that publishes again, or a dispute that never degrades.

Alternative: if loci already takes live payments, give a penalty_per_week for the support load and the revenue lost to disputes that never degrade, in USD.

To set it: `flai edit S-0005 --revenue-per-week 0 --penalty-per-week 0 --time-lost-per-cycle 30m`. You can set the inputs on E-0002 instead, once for the whole billing epic.

I am drafting the tasks now. I will write the value once the inputs are in.

### 2026-11-06T18:22:26Z bytepunx
set on story as recommended
