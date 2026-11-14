---
id: T-0154
type: task
nature: remediation
title: The scripts and integration READMEs describe the build retry and its variables
status: backlog
parent: S-0030
owner: bytepunx
created: 2026-11-14T10:09:51Z
updated: 2026-11-14T10:09:57Z
transitions: []
stream: S-0030
tags: [kluster, docs]
touches: [scripts/README.md, integration/README.md]
after: [T-0150]
---
# T-0154 The scripts and integration READMEs describe the build retry and its variables

## Work

In `scripts/README.md`, extend the `kluster-build.sh` row to say that it runs the build again on a transient registry failure, up to `KLUSTER_BUILD_ATTEMPTS` (3) with `KLUSTER_BUILD_RETRY_DELAY` (5 s, doubling) between attempts, and fails at once on any other failure. Add a `test-kluster-build.sh` row: it runs the script against a fake `docker`, and `test.sh` runs it. Extend the `test.sh` row to name it.

In `integration/README.md`, extend the build row of the kluster table the same way, in one sentence, linking `scripts/README.md` for the variables rather than repeating them.

This task waits for T-0150: it describes the retry and the variable names that task settles. It can run beside T-0152, since the two touch no file in common.

## Done when

- Both READMEs name the retry, and `scripts/README.md` names both variables and their defaults as T-0150's script has them.
- `scripts/lint-md.sh` passes on both files.

## Notes
