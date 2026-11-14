---
id: T-0152
type: task
nature: remediation
title: A test with a fake docker reproduces the dropped token call and runs in the test tier
status: backlog
parent: S-0030
owner: bytepunx
created: 2026-11-14T10:09:46Z
updated: 2026-11-14T10:09:46Z
transitions: []
stream: S-0030
tags: [kluster, scripts, testing]
touches: [scripts/test-kluster-build.sh, scripts/test.sh]
after: [T-0150]
---
# T-0152 A test with a fake docker reproduces the dropped token call and runs in the test tier

## Work

Write `scripts/test-kluster-build.sh`, POSIX `sh` under `set -eu`. It puts a fake `docker` first on `PATH` in a temporary directory, sets `FLAI_KLUSTER_TAG`, `FLAI_KLUSTER_IMAGES`, and `KLUSTER_BUILD_RETRY_DELAY=0`, and runs `scripts/kluster-build.sh tower` once for each case:

1. The fake fails its first `build` with I-0026's line, `failed to fetch oauth token: Post "https://auth.docker.io/token": unexpected EOF`, then passes. The script exits 0, the fake was called twice, and the images file lists the image once.
2. The fake fails every `build` with that line. The script exits non-zero after `KLUSTER_BUILD_ATTEMPTS` calls, and the images file is empty.
3. The fake fails with a compile error. The script exits with the fake's exit code after one call.

The fake counts its calls in a file. The test prints one line per case and exits non-zero on the first that fails. Run it from `scripts/test.sh` before the npm projects, since it needs no `node_modules` and no Docker.

This task waits for T-0150: it tests the retry that task writes and its two variables.

## Done when

- `scripts/test-kluster-build.sh` passes against T-0150's script.
- Each of the three cases fails when the retry is removed from `scripts/kluster-build.sh`.
- `scripts/test.sh` runs it, and `flai test scripts/kluster-build.sh` passes.

## Notes
