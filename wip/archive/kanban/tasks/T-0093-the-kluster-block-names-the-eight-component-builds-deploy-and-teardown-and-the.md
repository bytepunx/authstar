---
id: T-0093
type: task
nature: feature
title: "The kluster: block names the eight component builds, deploy, and teardown, and the scripts are documented"
status: done
parent: S-0019
owner: bytepunx
created: 2026-11-09T06:55:23Z
updated: 2026-11-09T22:28:48Z
transitions:
  - to: ready
    at: 2026-11-09T22:26:25Z
    by: agent-S-0019
  - to: in-progress
    at: 2026-11-09T22:26:25Z
    by: agent-S-0019
  - to: done
    at: 2026-11-09T22:28:48Z
    by: agent-S-0019
stream: S-0019
tags: [kluster, manifest, docs]
touches: [system-flow.yaml, kluster.yaml, scripts/README.md, integration/README.md, design/system/overview.md]
after: [T-0087, T-0091, T-0092]
usage:
  source: log
  seconds: 143
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 38
      output: 12229
      cache_read: 3585891
      cache_write: 52608
      cost: 1.3298
---
# T-0093 The kluster: block names the eight component builds, deploy, and teardown, and the scripts are documented

## Work

Name the scripts in the `kluster:` block with `flai manifest set`, never by hand, keeping `config: kluster.yaml`:

- `kluster.namespace`: `authstar`.
- `kluster.components`: one per service, in the order tower, keep, herald, lookout, chronicle, steward, web, portcullis, each `{"name":"<service>","build":["scripts/kluster-build.sh","<service>"]}`, so each build is its own step with its own log (ADR-0263 in system-flow).
- `kluster.deploy`: `["scripts/kluster-deploy.sh"]`; `kluster.teardown`: `["scripts/kluster-teardown.sh"]`; `kluster.timeout`: `30m`.

Give `kluster.yaml` the shared services the deploy expects, as the operator answers on the plan's thread: by the recommendation, `addons: [postgres, rabbitmq, clickhouse, dex]` and `trust-domain: authstar.cluster.local` over profile `signet`.

Add the four scripts and `lib-kluster.sh` to the table in `scripts/README.md`, and say in `integration/README.md` how a story's namespace is deployed and torn down: `flai kluster up`, `flai kluster deploy S-nnnn`, `flai kluster teardown S-nnnn`, and `flai kluster promote`, from the operator's shell.

Waits for T-0087, T-0091, and T-0092: the block names their scripts, and `flai check` reports a command whose program is missing.

## Done when

- `flai check --strict` reports no `manifest.kluster` finding, and the block lists eight components, `deploy`, and `teardown`.
- The markdown lint passes on both READMEs.

## Notes

Criterion 3, a story in review deployed into its namespace and torn down, is verified by the operator or flai serve: an agent's `flai kluster deploy` is refused by `flai guard`. Leave it unticked and say so in the story's Notes.
