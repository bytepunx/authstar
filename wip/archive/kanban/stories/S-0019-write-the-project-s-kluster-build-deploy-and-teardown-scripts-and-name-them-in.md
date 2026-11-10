---
id: S-0019
type: story
nature: feature
title: "Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block"
status: done
parent: E-0005
owner: bytepunx
created: 2026-11-09T06:51:07Z
updated: 2026-11-10T00:03:31Z
transitions:
  - to: ready
    at: 2026-11-09T21:56:01Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-09T21:57:38Z
    by: agent-S-0019
  - to: review
    at: 2026-11-09T22:46:00Z
    by: agent-S-0019
  - to: in-progress
    at: 2026-11-09T22:49:35Z
    by: bytepunx
  - to: review
    at: 2026-11-10T00:03:13Z
    by: bytepunx
  - to: done
    at: 2026-11-10T00:03:31Z
    by: bytepunx
tags: [kluster, scripts, integration]
topics: [kluster, deployment]
touches: [system-flow.yaml, scripts, scripts/kluster-build.sh, scripts/lib-kluster.sh, scripts/kluster-signet.sh, scripts/kluster-deploy.sh, scripts/kluster-teardown.sh, scripts/README.md, kluster.yaml, integration/README.md, integration/manifests/10-tower.yaml, integration/manifests/11-keep.yaml, integration/manifests/11-keep-pricing-sync-cronjob.yaml, integration/manifests/12-herald.yaml, integration/manifests/14-chronicle.yaml, integration/config/authstar/tower.yaml, design/system/overview.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 2917
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 2
      test_runs: 4
      hand_edits: 4
      work: 65
  models:
    - model: claude-opus-5-5
      input: 306
      output: 99163
      cache_read: 29078429
      cache_write: 426602
      cost: 10.7836
  strategic:
    - kind: orchestrator
      seconds: 136
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 58
          output: 387
          cache_read: 1675976
          cache_write: 307679
          cost: 2.2741
cost_of_delay:
  inputs:
    revenue_per_week: 1200
    by: bytepunx
    at: 2026-11-09T22:02:12Z
forecast:
  duration: 6h
  delivery: 2026-11-10T16:52:00Z
  basis: "Its own forecast of 6h; 2nd in the pull order with an in-progress limit of 4, behind S-0006, S-0007, S-0008, S-0013 and S-0005."
  by: flai
  at: 2026-11-09T21:56:05Z
---
# S-0019 Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block

## Goal

Give this project's kluster: block the commands that build its images, deploy a build into a namespace, and tear a namespace down, as design/system/kluster.md describes, so that flai deploys each story in review into its own namespace.

## Acceptance criteria

- [x] Scripts under scripts/ build the images, deploy into FLAI_KLUSTER_NAMESPACE, and tear it down
- [x] The kluster: block names them as build, or one build per component in components, and deploy and teardown

## Tasks

- T-0087 scripts/kluster-build.sh builds one service's image tagged FLAI_KLUSTER_TAG and lists it
- T-0088 The integration manifests and tower's config stop the rollout drift S-0575 found
- T-0089 scripts/lib-kluster.sh gives the kluster scripts their variables, renderer, and shared-service helpers
- T-0090 scripts/kluster-signet.sh seeds a namespace's signet bundles and cross-service policies
- T-0091 scripts/kluster-teardown.sh removes a story namespace's vhost, user, and prefixed databases
- T-0092 scripts/kluster-deploy.sh deploys a build into FLAI_KLUSTER_NAMESPACE over the shared services
- T-0093 The kluster: block names the eight component builds, deploy, and teardown, and the scripts are documented

## Notes

### Planning

The design is system-flow's `design/system/kluster.md` (§ The `kluster:` block, § The namespaces, § The steps and their variables). The work follows system-flow's S-0575 results, which deployed authstar by hand into story namespaces over one kluster and wrote its scripts out. The plan is on TH-0029.

Touches, and where each came from:

| Touch | Source | Why |
|-------|--------|-----|
| `system-flow.yaml` | declared | The `kluster:` block (T-0093) |
| `scripts` | declared | Kept as a folder: T-0090 may need a helper beside `kluster-signet.sh` to write signet bundles, since the `signet` CLI may not write one, and its name is not known until then |
| `scripts/kluster-build.sh`, `scripts/lib-kluster.sh`, `scripts/kluster-signet.sh`, `scripts/kluster-deploy.sh`, `scripts/kluster-teardown.sh` | design | The commands the block names, split as S-0575's scripts were (T-0087, T-0089 to T-0092) |
| `scripts/README.md` | co-change, layout | The scripts table lists every script (T-0093) |
| `kluster.yaml` | layout | The root config names profile `signet`, which installs no Postgres, RabbitMQ, ClickHouse, or Dex; the deploy needs them (T-0093, pending TH-0029) |
| `integration/README.md` | layout | Where the local cluster is documented (T-0093) |
| `integration/manifests/10-tower.yaml`, `11-keep.yaml`, `11-keep-pricing-sync-cronjob.yaml`, `12-herald.yaml`, `14-chronicle.yaml`, `integration/config/authstar/tower.yaml` | design | S-0575's drift that stops a rollout: signet's admin port and tower's `scope` (T-0088) |

The co-change list from `flai touches suggest` was the template's own files changed with `system-flow.yaml`. Only `scripts/README.md` and the `Makefile` bear on this story, and the `Makefile` is left out because flai, not make, runs these scripts.

Forecast: 6h. `flai forecast` gave 1h, its default with too little history. It is raised for seven tasks porting about 500 lines of S-0575's scripts and its signet seeding, which needed a tool of its own there. flai re-planned the delivery from the pull order since; it stands.

Cost of delay: no value yet. Neither S-0019 nor E-0005 has inputs; TH-0029 asks the operator for them.

No `after`: the story reads nothing another open story writes. S-0020, in review, fixes the builds of herald, keep, steward, and web; a live deploy needs their images to build, so it waits on S-0020's acceptance in fact, but no file of S-0020's is an input of these scripts.

The live deploy and teardown, once this story's third criterion, are verified by the operator or flai serve, never the story's agent: `flai guard` refuses an agent `flai kluster deploy`, and agents on this host run no cluster commands (D-0026).

### Delivery

- The live deploy and teardown are not part of this story. Its third criterion, "A story in review deploys into its namespace and its teardown removes it", was moved to S-0025, a follow-on story under E-0005 that waits for this one (`after: S-0019`), at the operator's request on 2026-11-09: it cannot be tested until this change is reviewed and accepted. Every script is checked with `shellcheck`, `sh -n`, and a `KLUSTER_DRY_RUN=1` run for `s-0019` and for `authstar`, and one real `docker build` of tower was run through `kluster-build.sh`. The signet push, the RabbitMQ and database steps, and the rollouts have not run against a cluster; S-0025 proves them.
- `kluster.config` names `integration/kluster.yaml`, as the operator confirmed on TH-0029, and the root `kluster.yaml` is removed.
- The signet bundles are pushed by `scripts/kluster-signet-push.mjs` through `@bytepunx/signet-client`, not through the signet CLI. Signet 0.10.3's `bundle push` sends no `config_path`, so it cannot write a config (signet's `server/cmd/signet/bundle_cmd.go`). The push needs `tower/node_modules`, and the deploy runs `npm ci` in `tower` when the checkout has none.
- 2026-11-09T22:49:35Z: moved to in-progress: Criteria can’t be tested until change is reviewed and approved
