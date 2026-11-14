---
id: TH-0055
title: "Plan for S-0027: the kluster scripts heal a moved k3d API port themselves, four tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0027-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md
  item: S-0027
status: open
participants: [planner-S-0027]
created: 2026-11-14T10:10:33Z
updated: 2026-11-14T10:10:33Z
---

# TH-0055 Plan for S-0027: the kluster scripts heal a moved k3d API port themselves, four tasks in three layers

On wip/kanban/stories/S-0027-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md.

## Entries

### 2026-11-14T10:10:33Z planner-S-0027
Proposed remedy (recommended): `kluster_require` in `scripts/lib-kluster.sh` heals the stale kubeconfig itself.

- When `/readyz` does not answer, it reads the port k3d's server load balancer publishes now with `docker port`.
- It writes a copy of `$KUBECONFIG` with that port under `$FLAI_KLUSTER_STATE`, exports `KUBECONFIG` to the copy, and checks again.
- It never rewrites flai's kept `.flai-cache/kluster/kubeconfig`, and it runs no `k3d` or `kluster` command.

The deploy, the teardown, and main's promote all go through `kluster_require`, so all of I-0023's failed jobs would have healed themselves.

Alternatives I did not plan:

- Fix it in flai: write the kubeconfig with `kluster kubeconfig` before each job. This is the lasting fix, but flai's code is not this repository's.
- Pin the API port in `integration/kluster.yaml`. Kluster v1.3.1 has no such setting (S-0025's narrative).

If you want either one instead, say so here and I will replan.

Tasks and layers:

| Layer | Task | Touches | After |
|-------|------|---------|-------|
| 1 | T-0153 `kluster_require` writes a kubeconfig with the live port | `scripts/lib-kluster.sh` | none |
| 2 | T-0156 shell test with a fake `kubectl` and `docker` on `PATH` | `scripts/test-kluster-kubeconfig.sh` | T-0153 |
| 2 | T-0159 `scripts/README.md` and `integration/README.md` | the two READMEs | T-0153 |
| 3 | T-0163 live `kluster_deploy` of S-0027, then close I-0023 | `design/issues/I-0023-…md`, `design/issues/summary.md` | T-0156, T-0159 |

T-0156 and T-0159 share no path, so they run together.

Figures:

- Forecast: 1h, up from flai's 11m. The plan has a new shell test and one live deploy job, and the close-out takes about 7m.
- Cost of delay: 100 USD a week, from your input of 40m lost per cycle.

Assumptions:

- `docker` is on `PATH` for flai serve's kluster jobs. `scripts/kluster-build.sh` already needs it.
- flai's own steps that read the kept kubeconfig still fail after a port move. `flai kluster up` stays their remedy, and the READMEs will say so. In I-0023's instances, every failure was in a script.
- The golden-path check (`integration/scripts/scenario-golden-path.sh`) does not source `lib-kluster.sh`, and no instance names it, so it is left out.
- The test runs by hand and in the close-out's shellcheck. No test tier selects `scripts/` today.
- `scripts/deploy-story.sh` keeps its `flai kluster up` line, because it is your script.
