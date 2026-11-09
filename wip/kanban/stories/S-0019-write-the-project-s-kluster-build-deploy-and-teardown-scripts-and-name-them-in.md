---
id: S-0019
type: story
nature: feature
title: "Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block"
status: backlog
parent: E-0005
owner: bytepunx
created: 2026-11-09T06:51:07Z
updated: 2026-11-09T06:55:59Z
transitions: []
tags: [kluster, scripts, integration]
topics: [kluster, deployment]
touches: [system-flow.yaml, scripts, scripts/kluster-build.sh, scripts/lib-kluster.sh, scripts/kluster-signet.sh, scripts/kluster-deploy.sh, scripts/kluster-teardown.sh, scripts/README.md, kluster.yaml, integration/README.md, integration/manifests/10-tower.yaml, integration/manifests/11-keep.yaml, integration/manifests/11-keep-pricing-sync-cronjob.yaml, integration/manifests/12-herald.yaml, integration/manifests/14-chronicle.yaml, integration/config/authstar/tower.yaml]
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
    - kind: orchestrator
      seconds: 29
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 10
          output: 75
          cache_read: 231674
          cache_write: 74171
          cost: 0.3589
forecast:
  duration: 6h
  delivery: 2026-11-09T23:00:00Z
  basis: "Seven tasks in four layers porting S-0575's by-hand scripts and its signet seeding to the project, with two drift fixes; flai's 1h default had no history to rest on."
  by: planner-S-0019
  at: 2026-11-09T06:55:59Z
---
# S-0019 Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block

## Goal

Give this project's kluster: block the commands that build its images, deploy a build into a namespace, and tear a namespace down, as design/system/kluster.md describes, so that flai deploys each story in review into its own namespace.

## Acceptance criteria

- [ ] Scripts under scripts/ build the images, deploy into FLAI_KLUSTER_NAMESPACE, and tear it down
- [ ] The kluster: block names them as build, or one build per component in components, and deploy and teardown
- [ ] A story in review deploys into its namespace and its teardown removes it

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

The design is system-flow's `design/system/kluster.md` (§ The `kluster:` block, § The namespaces, § The steps and their variables). The work follows system-flow's S-0575 results, which deployed authstar by hand into story namespaces over one kluster and wrote its scripts out.

Touches, and where each came from:

| Touch | Source | Why |
|-------|--------|-----|
| `system-flow.yaml` | declared | The `kluster:` block (T-0093) |
| `scripts` | declared | Kept as a folder: T-0090 may need a helper beside `kluster-signet.sh` to write signet bundles, since the `signet` CLI may not write one, and its name is not known until then |
| `scripts/kluster-build.sh`, `scripts/lib-kluster.sh`, `scripts/kluster-signet.sh`, `scripts/kluster-deploy.sh`, `scripts/kluster-teardown.sh` | design | The commands the block names, split as S-0575's scripts were (T-0087, T-0089 to T-0092) |
| `scripts/README.md` | co-change, layout | The scripts table lists every script (T-0093) |
| `kluster.yaml` | layout | The root config names profile `signet`, which installs no Postgres, RabbitMQ, ClickHouse, or Dex; the deploy needs them (T-0093, pending the plan's thread) |
| `integration/README.md` | layout | Where the local cluster is documented (T-0093) |
| `integration/manifests/10-tower.yaml`, `11-keep.yaml`, `11-keep-pricing-sync-cronjob.yaml`, `12-herald.yaml`, `14-chronicle.yaml`, `integration/config/authstar/tower.yaml` | design | S-0575's drift that stops a rollout: signet's admin port and tower's `scope` (T-0088) |

The co-change list from `flai touches suggest` was the template's own files changed with `system-flow.yaml`. Only `scripts/README.md` and the `Makefile` bear on this story, and the `Makefile` is left out because flai, not make, runs these scripts.

Forecast: 6h, delivery 2026-11-09T23:00Z. `flai forecast` gave 1h, its default with too little history. It is raised for seven tasks porting about 500 lines of S-0575's scripts and its signet seeding, which needed a tool of its own there. Delivery is flai's 17:54Z moved by the 5h added.

Cost of delay: no value yet. Neither S-0019 nor E-0005 has inputs; the plan's thread asks the operator for them.

No `after`: the story reads nothing another open story writes.

Criterion 3 is verified by the operator or flai serve, never the story's agent: `flai guard` refuses an agent `flai kluster deploy`, and agents on this host run no cluster commands (D-0026).
