---
id: S-0027
type: story
nature: remediation
title: flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves
status: backlog
owner: bytepunx
created: 2026-11-14T08:26:32Z
updated: 2026-11-15T07:10:14Z
transitions: []
tags: []
topics: [kluster, integration, testing]
touches: [scripts/lib-kluster.sh, scripts/test-kluster-kubeconfig.sh, scripts/README.md, integration/README.md, design/issues/I-0023-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md, design/issues/summary.md]
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
      seconds: 2
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 3
          output: 923
          cache_read: 112048
          cache_write: 5253
          cost: 0.0829
    - kind: orchestrator
      seconds: 25
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 7
          output: 46
          cache_read: 248307
          cache_write: 26675
          cost: 0.3157
cost_of_delay:
  inputs:
    time_lost_per_cycle: 40m
    by: flai
    at: 2026-11-14T08:26:32Z
  value: 100
  by: planner-S-0027
  at: 2026-11-14T10:09:37Z
forecast:
  duration: 1h
  delivery: 2026-11-30T10:34:00Z
  basis: "Its own forecast of 1h; 7th in the pull order with an in-progress limit of 4, behind S-0014, S-0021, S-0022, S-0012, S-0007, S-0008, S-0010, S-0024 and S-0026."
  by: flai
  at: 2026-11-15T07:10:14Z
finalized:
  by: bytepunx
  at: 2026-11-14T10:15:25Z
---
# S-0027 flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves

## Goal

This story remediates [I-0023](../../../design/issues/I-0023-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md), "flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0023 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0023 is closed with `flai issue close I-0023 --reason` saying what fixed it

## Tasks
- T-0153 kluster_require writes a kubeconfig with the API port k3d publishes now when the kept one's port is dead
- T-0156 A shell test reproduces a moved k3d API port with a fake kubectl and docker on PATH
- T-0159 scripts/README.md and integration/README.md say the kluster scripts follow a moved API port themselves
- T-0163 A live deploy of S-0027 passes through the new check, and I-0023 is closed

## Notes

Cost of delay inputs set by flai from I-0023. time_lost_per_cycle 40m: 20m per occurrence × 2 occurrences ÷ 1 cycle of 168h (first reported 2026-11-13T12:32:47Z, 0.8 days before this story; under one cycle counts as one).

### Planning

Proposed remedy, put to the operator on the plan's thread: the kluster scripts heal a moved API port themselves. Kluster v1.3.1 has no setting to pin k3d's API host port (S-0025's narrative), and flai's own kubeconfig writing is not this repository's code. So `kluster_require` in `scripts/lib-kluster.sh`, when `/readyz` does not answer, reads the port the k3d server load balancer publishes now with `docker port`. It writes a copy of `$KUBECONFIG` with that port under `$FLAI_KLUSTER_STATE`, exports `KUBECONFIG` to the copy, and checks `/readyz` again. It never rewrites flai's kept `.flai-cache/kluster/kubeconfig`. The deploy, the teardown, and main's promote all run through `kluster_require`, so each job heals itself.

Touches, all files:

| Touch | Source | Why |
|-------|--------|-----|
| `scripts/lib-kluster.sh` | design (I-0023, T-0136) | `kluster_require` holds the `/readyz` check the fix extends |
| `scripts/test-kluster-kubeconfig.sh` | layout | new: the test that reproduces a moved port with a fake `kubectl` and `docker` on `PATH` |
| `scripts/README.md` | layout | lists every script and what `lib-kluster.sh` does |
| `integration/README.md` | design | its kluster section tells the operator to run `flai kluster up` on a stale kubeconfig |
| `design/issues/I-0023-…md` | criteria | `flai issue close` writes it |
| `design/issues/summary.md` | criteria | flai regenerates it when the issue closes |

`flai touches suggest` listed co-changes no higher than 11%, all in `integration/config`, `integration/secrets`, and other issues: none is part of this fix, so none was added. `integration/scripts/scenario-golden-path.sh` does not source `lib-kluster.sh` and no instance names the check, so it stays out. `scripts/deploy-story.sh` keeps its `flai kluster up` line: it is the operator's script.

No folder touch and no `after`: the story reads nothing another open story writes.

Figures:

- Forecast 1h, up from flai's 11m: four tasks, a new shell test with fakes, one live `kluster_deploy` job of about 3m, and a close-out of about 7m (S-0006's took 6m55s). T-0136, a smaller change to the same function, took 6m alone. Delivery stays flai's, 2026-11-16T21:51:00Z, from the pull order.
- Cost of delay 100 USD a week, as `flai cod` worked it from the operator's input of 40m lost per cycle at 150 USD an hour. It stands: each port move fails every kluster job until someone runs `flai kluster up`.
