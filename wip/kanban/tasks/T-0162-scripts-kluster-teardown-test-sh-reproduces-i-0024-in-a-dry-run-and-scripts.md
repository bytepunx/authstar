---
id: T-0162
type: task
nature: remediation
title: scripts/kluster-teardown.test.sh reproduces I-0024 in a dry run, and scripts/test.sh runs it
status: backlog
parent: S-0028
owner: bytepunx
created: 2026-11-14T10:10:08Z
updated: 2026-11-14T10:10:08Z
transitions: []
stream: S-0028
tags: [kluster, shell, testing]
touches: [scripts/kluster-teardown.test.sh, scripts/test.sh]
after: [T-0158]
---
# T-0162 scripts/kluster-teardown.test.sh reproduces I-0024 in a dry run, and scripts/test.sh runs it

## Work

Write `scripts/kluster-teardown.test.sh`, POSIX `sh` under `set -eu`, which reproduces what I-0024 found without a cluster:

- Set the `FLAI_KLUSTER_*` variables for a story namespace, with the state and log folders and `KLUSTER_TEARDOWN_REPORTS` in a scratch folder from `mktemp -d`, and `KLUSTER_DRY_RUN=1`.
- Run `scripts/kluster-teardown.sh`, then remove the state and log folders as flai does after a passing teardown.
- Assert that the report is still there and names the namespace, each of the five steps, and the outcome. Fail naming what is missing.
- Assert that the default namespace is still refused, and writes no report claiming it passed.

Have `scripts/test.sh`, the one test tier `flai test` runs here, run it first, before the npm projects. If the dry run needs `tower/node_modules`, fail as `scripts/test.sh` does for a project without them, saying to run `make install`.

It waits for T-0158, whose report it reads.

## Done when

- `sh scripts/kluster-teardown.test.sh` passes on T-0158's change and fails on the teardown as it was before T-0158, naming the missing report.
- `flai test scripts/kluster-teardown.sh` runs it and passes.

## Notes
