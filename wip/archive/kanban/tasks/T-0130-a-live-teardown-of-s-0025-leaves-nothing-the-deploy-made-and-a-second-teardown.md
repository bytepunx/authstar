---
id: T-0130
type: task
nature: remediation
title: A live teardown of S-0025 leaves nothing the deploy made, and a second teardown passes
status: done
parent: S-0025
owner: bytepunx
created: 2026-11-09T23:40:56Z
updated: 2026-11-13T21:52:19Z
transitions:
  - to: ready
    at: 2026-11-13T21:52:18Z
    by: agent-S-0025
  - to: in-progress
    at: 2026-11-13T21:52:18Z
    by: agent-S-0025
  - to: done
    at: 2026-11-13T21:52:19Z
    by: agent-S-0025
stream: S-0025
tags: [kluster, scripts, integration]
touches: [scripts/kluster-teardown.sh, scripts/kluster-signet-remove.mjs, scripts/lib-kluster.sh]
after: [T-0128, T-0129]
usage:
  source: log
  seconds: 1
  estimated: true
  priced_by: harness
  models: []
---
# T-0130 A live teardown of S-0025 leaves nothing the deploy made, and a second teardown passes

## Work

Waits for T-0128, which leaves `s-0025` deployed for this teardown to remove, and for T-0129, whose bundle removal this run proves.

Add a last step to `scripts/kluster-teardown.sh` that checks, and logs, that each thing the deploy made outside the namespace is gone: the RabbitMQ vhost and user, the `s0025_` Postgres and ClickHouse databases, the namespace's signet policies, and its bundles. It fails, naming what remains. The job's log is then the proof, since the agent runs no cluster command (D-0026).

Then, as in T-0128:

1. Ask the operator on a thread on S-0025 to run `flai kluster teardown S-0025`.
2. Read the job's log under `.flai-cache/kluster/logs`, and check with `flai kluster deployments` that `s-0025` is gone.
3. Fix the step that failed in `scripts/kluster-teardown.sh`, `scripts/kluster-signet-remove.mjs`, or `scripts/lib-kluster.sh`. When a fix needs a namespace to remove again, ask for a deploy first.
4. Once a teardown passes, ask for a second, to prove it passes over what is already gone.

Record each round, its job and the step it failed at, in this task's Notes.

## Done when

- A `flai kluster teardown S-0025` job records success, and its last step logs the vhost, user, databases, policies, and bundles of `s-0025` as gone
- `flai kluster deployments` lists nothing in `s-0025`
- A second teardown records success too
- `shellcheck` and `sh -n` pass on every changed script, `node --check` on `scripts/kluster-signet-remove.mjs`, and `KLUSTER_DRY_RUN=1` runs of the teardown still pass for `s-0025` and refuse `authstar`
- This task's Notes list each teardown job, the step it failed at, and the fix

## Notes
