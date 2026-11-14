---
id: S-0025
type: story
nature: feature
title: A story in review deploys into its own kluster namespace and its teardown removes it
status: review
parent: E-0005
owner: bytepunx
created: 2026-11-09T23:37:51Z
updated: 2026-11-13T22:02:55Z
transitions:
  - to: ready
    at: 2026-11-13T12:07:34Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-13T12:07:49Z
    by: agent-S-0025
  - to: review
    at: 2026-11-13T22:02:55Z
    by: agent-S-0025
blocked:
  - from: 2026-11-13T12:40:01Z
    until: 2026-11-13T19:46:49Z
    reason: awaiting the operator on TH-0045
  - from: 2026-11-13T19:47:50Z
    until: 2026-11-13T21:40:54Z
    reason: awaiting the operator on TH-0045
tags: [kluster, scripts, integration]
topics: [kluster, deployment]
touches: [scripts/lib-kluster.sh, scripts/kluster-deploy.sh, scripts/kluster-teardown.sh, scripts/README.md, integration/README.md, scripts/kluster-signet-remove.mjs, design/issues/I-0023-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md, design/issues/summary.md, design/issues/I-0024-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md]
after: [S-0019]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 3379
  priced_by: harness
  turns:
    - day: 2026-11-13
      ceremony: 3
      work: 103
    - day: 2026-11-14
      ceremony: 2
      work: 10
  models:
    - model: claude-opus-5-5
      input: 294
      output: 67180
      cache_read: 25962776
      cache_write: 810513
      cost: 12.9305
  strategic:
    - kind: planner
      seconds: 8893
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 112
          output: 25666
          cache_read: 6927479
          cache_write: 135227
          cost: 2.9811
    - kind: orchestrator
      seconds: 176
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 106
          output: 781
          cache_read: 3161809
          cache_write: 588806
          cost: 4.2764
cost_of_delay:
  inputs:
    revenue_per_week: 1200
    by: bytepunx
    at: 2026-11-13T12:09:37Z
forecast:
  duration: 4h
  delivery: 2026-11-10T21:55:00Z
  basis: "Its own forecast of 4h; 13th in the pull order with an in-progress limit of 4, behind S-0006, S-0007, S-0008, S-0013, S-0005, S-0010, S-0012, S-0014, S-0015, S-0016, S-0017, S-0018, S-0021, S-0022, S-0023 and S-0024."
  by: flai
  at: 2026-11-10T00:03:32Z
finalized:
  by: bytepunx
  at: 2026-11-13T12:07:28Z
---
# S-0025 A story in review deploys into its own kluster namespace and its teardown removes it

## Goal

Prove S-0019's kluster scripts against a live cluster: a story in review deploys into its own namespace through the `kluster:` block, and its teardown removes everything the deploy made, with whatever the live run finds wrong in the scripts fixed.

## Acceptance criteria

- [x] A story in review deploys into its namespace and its teardown removes it

## Tasks

- T-0128 A live deploy of S-0025 into s-0025 rolls out all eight services, and a second deploy passes
- T-0129 kluster-teardown.sh deletes the namespace's signet bundles through kluster-signet-remove.mjs
- T-0130 A live teardown of S-0025 leaves nothing the deploy made, and a second teardown passes
- T-0131 scripts/README.md and integration/README.md say what the live deploy and teardown changed
- T-0136 The kluster scripts say the cluster does not answer, instead of a pod being absent

## Notes

Split from S-0019, whose third criterion this was. It could not be met inside S-0019: the `kluster:` block and the scripts it names reach the main branch only when S-0019 is accepted, so no story in review can deploy through them before then. Hence `after: S-0019`.

What S-0019 left unproven, from its delivery notes: every script passed `shellcheck`, `sh -n`, and a `KLUSTER_DRY_RUN=1` run, and `kluster-build.sh` built tower's image for real, but the signet push (`scripts/kluster-signet-push.mjs`), the RabbitMQ and database steps, and the rollouts have never run against a cluster.

The live run is the operator's or flai serve's, never the story's agent's: `flai guard` refuses an agent `flai kluster deploy`, and agents on this host run no cluster commands (D-0026). The agent's part is to fix what the run reports and to keep `scripts/README.md` and `integration/README.md` true to what changed.

The touches are the scripts S-0019 wrote, since a failed deploy or teardown is fixed there; narrow them to what the run shows needs changing.

No cost of delay inputs yet; they are the operator's to give.

### Planning

`after: S-0019`: this story reads S-0019's output on main, the `kluster:` block in `system-flow.yaml` and the scripts it names (`scripts/kluster-build.sh`, `kluster-deploy.sh`, `kluster-teardown.sh`, `kluster-signet.sh`, `kluster-signet-push.mjs`, `lib-kluster.sh`). It deploys through them and fixes them; neither exists on main until S-0019 is accepted.

Tasks, in three layers: T-0128 (live deploy) and T-0129 (bundle removal, no cluster) run together; T-0130 (live teardown) waits for both; T-0131 (docs) waits for T-0130.

Touches, and where each came from:

| Touch | Source | Why |
|-------|--------|-----|
| `scripts/kluster-build.sh`, `scripts/lib-kluster.sh`, `scripts/kluster-signet.sh`, `scripts/kluster-signet-push.mjs`, `scripts/kluster-deploy.sh`, `scripts/kluster-teardown.sh`, `scripts/README.md`, `integration/README.md` | declared | The scripts a failed deploy or teardown is fixed in, and their documentation |
| `scripts/kluster-signet-remove.mjs` | design | The goal asks the teardown to remove everything the deploy made. S-0019's teardown leaves the namespace's signet bundles, since the signet CLI cannot delete one; `@bytepunx/signet-client` has `DeleteConfig` and `DeleteSecret`, so a helper beside `kluster-signet-push.mjs` can (T-0129) |
| `integration/scripts/lib-secrets.sh` | co-change | Changed with the declared files in 24% of their commits; `kluster-signet-push.mjs` builds the bundles' secrets from it |
| `integration/manifests/00-namespace.yaml`, `admin-rbac.yaml`, `10-tower.yaml` to `17-portcullis.yaml` | layout | The manifests `kluster-deploy.sh` applies; a rollout that fails on a manifest is fixed there, as S-0019's T-0088 fixed the drift S-0575 found |
| `integration/config/authstar/<service>.yaml`, all eight | co-change, layout | The configs `kluster-signet-push.mjs` pushes as each service's bundle; a service that fails at startup on its config is fixed there |

The co-change list from `flai touches suggest` also named `integration/scripts/provision.sh`, `docs/contributors/index.md`, the per-service `config.yaml` folders, the `integration/secrets` files, `system-flow.yaml`, and the `Makefile`. They are left out: the kluster scripts read none of them, and `system-flow.yaml`'s block names the commands, which this story does not rename.

No folder touch: every file a fix may change is named.

Forecast: 4h, delivery 2026-11-10T22:05Z. `flai forecast` gave 10m at a size of 9, and 32m once the touches grew to 30, at 61 s per unit over four done stories: too few to judge a live-cluster story by. It is raised for two deploy-or-teardown, read-the-log, fix loops (T-0128, T-0130) over steps that have never run: the signet push, the RabbitMQ and database steps, and the rollouts. Each round waits on a deploy that builds eight images and waits for eight rollouts; S-0019's close-out alone took 16m. The time waiting for the operator to run a job is not counted. The delivery is flai's start for this story, about 18:03Z, plus the 4h.

Cost of delay: no value yet. S-0025 has no inputs and E-0005 has neither inputs nor a value; the plan's thread asks the operator for them.
