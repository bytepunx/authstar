---
id: S-0028
type: story
nature: improvement
title: A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards
status: backlog
owner: bytepunx
created: 2026-11-14T08:26:33Z
updated: 2026-11-15T05:53:17Z
transitions: []
tags: [kluster, scripts]
topics: [kluster, integration, testing]
touches: [scripts/kluster-teardown.sh, scripts/lib-kluster.sh, scripts/kluster-teardown.test.sh, scripts/test.sh, scripts/README.md, integration/README.md, design/issues/I-0024-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md, design/issues/summary.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: planner
      seconds: 19
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 14
          output: 2957
          cache_read: 712053
          cache_write: 24998
          cost: 0.4007
    - kind: orchestrator
      seconds: 33
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 10
          output: 73
          cache_read: 352891
          cache_write: 41154
          cost: 0.4528
cost_of_delay:
  inputs:
    time_lost_per_cycle: 15m
    by: flai
    at: 2026-11-14T08:26:33Z
  value: 37.5
  by: planner-S-0028
  at: 2026-11-14T10:09:28Z
forecast:
  duration: 1h30m
  delivery: 2026-11-30T17:48:00Z
  basis: "Its own forecast of 1h30m; 9th in the pull order with an in-progress limit of 4, behind S-0014, S-0021, S-0022, S-0012, S-0007, S-0008, S-0010, S-0018, S-0024, S-0026 and S-0027."
  by: flai
  at: 2026-11-15T05:53:17Z
finalized:
  by: bytepunx
  at: 2026-11-14T10:15:29Z
---
# S-0028 A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards

## Goal

This story remediates [I-0024](../../../design/issues/I-0024-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md), "A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0024 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0024 is closed with `flai issue close I-0024 --reason` saying what fixed it

## Tasks
- T-0158 kluster-teardown.sh keeps a report of what it removed in the main checkout, where flai does not delete it
- T-0162 scripts/kluster-teardown.test.sh reproduces I-0024 in a dry run, and scripts/test.sh runs it
- T-0164 scripts/README.md and integration/README.md say where a teardown's report is kept and how to read it
- T-0167 A live teardown of s-0028 leaves its report readable after flai removes the log, and I-0024 is closed

## Notes

Cost of delay inputs set by flai from I-0024. time_lost_per_cycle 15m: 15m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-13T21:52:05Z, 0.4 days before this story; under one cycle counts as one).

### Planning

Proposed fix. Removing the log is flai's documented behaviour: `flai kluster teardown --help` says the record, the state folder, and the logs are removed once a teardown passes. This repository cannot change flai. So `scripts/kluster-teardown.sh` keeps its own report of what each step found and removed, in the main checkout's `.flai-cache/kluster/teardowns/`, which flai does not remove. It writes to the main checkout because the teardown runs in the story's worktree, which acceptance removes. The job record's wrong steps, which I-0024 also names, are flai's to fix and are left out.

Touches, each a file:

| Touch | Source | Why |
|-------|--------|-----|
| `scripts/kluster-teardown.sh` | design | The teardown that writes the report (T-0158). `flai touches suggest` named no co-change partner from it or `lib-kluster.sh`: 5 of 569 commits changed them. |
| `scripts/lib-kluster.sh` | layout | The helpers that find the main checkout and open the report (T-0158) |
| `scripts/kluster-teardown.test.sh` | layout | New: the dry-run test that reproduces I-0024 (T-0162) |
| `scripts/test.sh` | layout | The one test tier, as the manifest has no tests block, so it runs the new test (T-0162) |
| `scripts/README.md` | design | Documents the teardown script (T-0164) |
| `integration/README.md` | design | Documents the teardown and the kluster commands (T-0164) |
| `design/issues/I-0024-…` | design | Closed by criterion 2 (T-0167) |
| `design/issues/summary.md` | co-change | flai regenerates it when the issue closes (T-0167) |

No folder touch and no `after`: the story reads nothing another open story writes.

Forecast: 1h30m, raised from flai's 21m (126 s per unit of size times 10). S-0025, the last kluster story with a live deploy and teardown, took 1h4m of agent work. This one adds a new script test as well. Delivery 2026-11-17T00:20Z is flai's 2026-11-16T23:11Z, 12th in the pull order, moved later by the 1h9m added.

Cost of delay: 37.50 USD a week, as `flai cod` gives from the 15m `time_lost_per_cycle` input at 150 USD an hour. It stands: one occurrence, and a workaround exists (copy the log while the teardown runs).
