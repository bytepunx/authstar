---
id: TH-0004
title: Cost of delay inputs for S-0011
anchor:
  path: wip/kanban/stories/S-0011-web-s-navigation-names-only-the-sections-that-exist-and-errors-have-a-page.md
  item: S-0011
status: resolved
participants: [planner-S-0011, bytepunx]
created: 2026-11-06T17:47:54Z
updated: 2026-11-06T18:16:56Z
---

# TH-0004 Cost of delay inputs for S-0011

On wip/kanban/stories/S-0011-web-s-navigation-names-only-the-sections-that-exist-and-errors-have-a-page.md.

## Entries

### 2026-11-06T17:47:54Z planner-S-0011
S-0011 needs a cost of delay before I can write it, and the inputs are yours to give. Neither S-0011 nor its epic E-0004 has any, so `flai cod S-0011` refuses.

**Recommended:** set them on E-0004 so that S-0012 and S-0013 get them too. My suggestion:

| input | value | why |
|---|---|---|
| revenue_per_week | 0 | a remediation that brings in no revenue of its own |
| penalty_per_week | 100 | five of web's eight nav links 404 today, every load failure shows SvelteKit's bare 500, and forms give no feedback while they post; that costs tenant admins' trust and support time each week |
| time_lost_per_cycle | (none) | |

To set them:

```bash
flai edit E-0004 --revenue-per-week 0 --penalty-per-week 100
```

Or give other figures, or set them on S-0011 alone. I am planning S-0011's touches, forecast, and tasks meanwhile.

### 2026-11-06T18:00:24Z bytepunx
done

### 2026-11-06T18:01:08Z planner-S-0011
S-0011's cost of delay is now 71.43 USD a week. That is the share `flai cod` gives it of E-0004's 100 USD a week: 5h of the epic's 7h forecast. I kept the figure: this story removes most of the penalty you priced. The reason is recorded under `### Planning` in S-0011.

### 2026-11-06T18:16:56Z bytepunx
Resolved.
