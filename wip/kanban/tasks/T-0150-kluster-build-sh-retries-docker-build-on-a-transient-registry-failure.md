---
id: T-0150
type: task
nature: remediation
title: kluster-build.sh retries docker build on a transient registry failure
status: backlog
parent: S-0030
owner: bytepunx
created: 2026-11-14T10:09:38Z
updated: 2026-11-14T10:09:38Z
transitions: []
stream: S-0030
tags: [kluster, scripts]
touches: [scripts/kluster-build.sh]
---
# T-0150 kluster-build.sh retries docker build on a transient registry failure

## Work

Wrap the `docker build` in `scripts/kluster-build.sh` in a bounded retry. Run the build with its output saved to a temporary file and copied to stderr, keeping its exit code. Do not pipe it through `tee`, which hides the exit code under POSIX `sh`. When the build fails and its output names a transient registry failure, wait and run it again:

- `failed to fetch oauth token`
- `unexpected EOF`
- `connection reset by peer`
- `TLS handshake timeout`
- `i/o timeout`
- `429 Too Many Requests`
- a registry's `5xx`

Stop after `KLUSTER_BUILD_ATTEMPTS` attempts, 3 by default, with `KLUSTER_BUILD_RETRY_DELAY` seconds between them, 5 by default, doubling after each one. Any other failure exits at once with the build's exit code, as today. Log each retry to stderr, naming the attempt and the matched line. List the image in `$FLAI_KLUSTER_IMAGES` only after a build passes. Keep the script POSIX `sh` under `set -eu`, and update its header comment to cover the retry and both variables.

This task waits for nothing: it is the fix the other tasks test, describe, and close the issue on.

## Done when

- A build that fails with `failed to fetch oauth token: Post "https://auth.docker.io/token": unexpected EOF` runs again and passes on a later attempt.
- A build that fails for any other reason fails at once with its own exit code.
- The image is listed once, and only after a build passes.
- `sh -n scripts/kluster-build.sh` passes.

## Notes
