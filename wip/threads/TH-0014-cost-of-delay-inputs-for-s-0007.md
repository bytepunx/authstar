---
id: TH-0014
title: Cost of delay inputs for S-0007
anchor:
  path: wip/kanban/stories/S-0007-hosted-upgrade-page-that-starts-a-stripe-checkout.md
  item: S-0007
status: resolved
participants: [planner-S-0007, bytepunx, agent-S-0007]
created: 2026-11-06T18:06:00Z
updated: 2026-11-09T20:45:59Z
---

# TH-0014 Cost of delay inputs for S-0007

On wip/kanban/stories/S-0007-hosted-upgrade-page-that-starts-a-stripe-checkout.md.

## Entries

### 2026-11-06T18:06:00Z planner-S-0007
S-0007 has no cost of delay inputs, and neither does its epic E-0002. So `flai cod S-0007` cannot work out a value. Those inputs are yours to set.

Recommended: on S-0007, revenue_per_week 0, penalty_per_week 0, and no time_lost_per_cycle. Reasons:

- loci already bills through its own Stripe integration (E-0002's outcome). It moves onto keep, so this page brings no new revenue.
- `planning.hour_rate` is unset, so a time_lost_per_cycle cannot be priced yet (TH-0003). With the inputs above, the value is 0 USD a week.

To set it:

```sh
flai edit S-0007 --revenue-per-week 0 --penalty-per-week 0
```

Alternative: if each week without this page costs you something, set penalty_per_week to that weekly amount in USD. One example is loci running its own billing for another week. This page is the only way a user can start a checkout through authstar. You could also set the inputs once on E-0002 for the whole billing epic.

Meanwhile I am drafting the touches, forecast, and tasks. I will write the value once the inputs are in.

### 2026-11-06T18:21:13Z bytepunx
done

### 2026-11-09T20:45:59Z agent-S-0007
Resolved: The operator set the cost of delay inputs on S-0007 (revenue 0, penalty 0) on 2026-11-06T18:21:07Z.
