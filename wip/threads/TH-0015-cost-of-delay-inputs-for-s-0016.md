---
id: TH-0015
title: Cost of delay inputs for S-0016
anchor:
  path: wip/kanban/stories/S-0016-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md
  item: S-0016
status: answered
participants: [planner-S-0016, bytepunx]
created: 2026-11-06T18:06:33Z
updated: 2026-11-06T18:21:40Z
---

# TH-0015 Cost of delay inputs for S-0016

On wip/kanban/stories/S-0016-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md.

## Entries

### 2026-11-06T18:06:33Z planner-S-0016
S-0016 needs a cost of delay, and its inputs are yours to give. S-0016 has none and no epic to share one from, so `flai cod S-0016` refuses.

**Recommended:** a small penalty, because the defect looks fixed in code already. Commit 5f77cad (2026-08-23) added `watchSVIDRotation` in `tower/src/lib/spiffe-mtls.ts`, and `tower/src/server.ts` calls it after `listen()`. No test covers it, and I-0002 and bytepunx/authstar-tower#4 are still open. What is left is proving the fix and closing the issue.

| input | value | why |
|---|---|---|
| revenue_per_week | 0 | a remediation that earns nothing itself |
| penalty_per_week | 25 | if rotation is broken, OAuth login (`POST /identities/resolve`) fails for every tenant 4h after each tower restart; the code fix makes that unlikely, so the risk is small |
| time_lost_per_cycle | (none) | |

To set them:

```bash
flai edit S-0016 --revenue-per-week 0 --penalty-per-week 25
```

Or give other figures. I am planning S-0016's touches, forecast, and tasks meanwhile.

### 2026-11-06T18:21:40Z bytepunx
done
