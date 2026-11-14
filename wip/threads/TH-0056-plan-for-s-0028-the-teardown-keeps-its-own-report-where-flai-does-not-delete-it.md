---
id: TH-0056
title: "Plan for S-0028: the teardown keeps its own report where flai does not delete it, four tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0028-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md
  item: S-0028
status: open
participants: [planner-S-0028]
created: 2026-11-14T10:10:51Z
updated: 2026-11-14T10:10:51Z
---

# TH-0056 Plan for S-0028: the teardown keeps its own report where flai does not delete it, four tasks in three layers

On wip/kanban/stories/S-0028-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md.

## Entries

### 2026-11-14T10:10:51Z planner-S-0028
The plan: `scripts/kluster-teardown.sh` keeps its own report of what it removed in the main checkout's `.flai-cache/kluster/teardowns/`, which flai does not delete. Four tasks in three layers.

## Why this fix

Removing the log is flai's documented behaviour: `flai kluster teardown --help` says the record, the state folder, and the logs are removed once a teardown passes. This repository cannot change flai, so the script keeps its own copy. The copy goes in the main checkout because flai runs the teardown in the story's worktree, which acceptance removes.

## Tasks

| Layer | Task | Touches | After |
|-------|------|---------|-------|
| 1 | T-0158: the teardown writes a report of what each step found and removed, ending with the outcome and printing its path; `KLUSTER_TEARDOWN_REPORTS` moves it | `scripts/kluster-teardown.sh`, `scripts/lib-kluster.sh` | none |
| 2 | T-0162: `scripts/kluster-teardown.test.sh` reproduces I-0024 in a dry run, removing the log as flai does; `scripts/test.sh` runs it | `scripts/kluster-teardown.test.sh`, `scripts/test.sh` | T-0158 |
| 2 | T-0164: both READMEs say where the report is and how to read it | `scripts/README.md`, `integration/README.md` | T-0158 |
| 3 | T-0167: a live deploy and teardown of s-0028, asked of flai serve, leaves a readable report; I-0024 is closed | I-0024, `design/issues/summary.md` | T-0162, T-0164 |

T-0162 and T-0164 share no path, so they run together.

## Figures

- Forecast 1h30m, raised from flai's 21m: S-0025, the last kluster story with a live teardown, took 1h4m of agent work.
- Delivery 2026-11-17T00:20Z.
- Cost of delay 37.50 USD a week, from the 15m input.

## Assumptions

1. The fix lives in this repository's scripts. Keeping the log is a change to flai, which is system-flow's to make. If you would rather raise it upstream and close I-0024 as out of scope, say so and I will re-plan.
2. The job record listing the deploy's build steps for a teardown, also in I-0024, is a flai defect and is left out of this story.
3. The story's agent may ask flai serve for S-0028's own deploy and teardown jobs, as S-0025's agent did. It runs no cluster command itself (D-0026).
4. Reports pile up under `.flai-cache/kluster/teardowns/` and are never pruned. They are small, and the folder is ignored by git.

No splits, merges, or drops proposed.
