---
id: T-0087
type: task
nature: feature
title: scripts/kluster-build.sh builds one service's image tagged FLAI_KLUSTER_TAG and lists it
status: done
parent: S-0019
owner: bytepunx
created: 2026-11-09T06:54:16Z
updated: 2026-11-09T22:02:01Z
transitions:
  - to: ready
    at: 2026-11-09T21:59:45Z
    by: agent-S-0019
  - to: in-progress
    at: 2026-11-09T21:59:46Z
    by: agent-S-0019
  - to: done
    at: 2026-11-09T22:02:01Z
    by: agent-S-0019
stream: S-0019
tags: [kluster, scripts]
touches: [scripts/kluster-build.sh]
usage:
  source: log
  seconds: 135
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 11
      output: 3580
      cache_read: 1049722
      cache_write: 15400
      cost: 0.3893
---
# T-0087 scripts/kluster-build.sh builds one service's image tagged FLAI_KLUSTER_TAG and lists it

## Work

Write `scripts/kluster-build.sh <service>`, POSIX `sh` under `set -eu`, for one entry of the kluster block's `components`. It refuses a service outside the eight that have a `Dockerfile` (tower, keep, herald, lookout, chronicle, steward, web, portcullis) and an unset `FLAI_KLUSTER_TAG` or `FLAI_KLUSTER_IMAGES`. It runs `docker build` with the service's own `Dockerfile`, tags the image `docker.io/bytepunx/authstar-<service>:$FLAI_KLUSTER_TAG`, and appends that reference, one a line, to `$FLAI_KLUSTER_IMAGES`.

Check each `Dockerfile`'s build context first. Most copy from their own folder, but a service whose `package.json` reads a sibling such as `clients/typescript` by a `file:` path needs the repository root as its context. Name the context per service in the script, not by guess.

Waits for no task: it shares no file with the others, and the deploy reads only the image name it writes, which S-0575's results fix.

## Done when

- `shellcheck scripts/kluster-build.sh` and `sh -n` pass.
- Run with `FLAI_KLUSTER_TAG=s-0019-test` and a temporary `FLAI_KLUSTER_IMAGES` for tower, it builds the image and writes exactly its reference to the file; an unknown service and a missing variable exit non-zero with a message naming what is wrong.

## Notes

Agents on this host run no cluster commands (D-0026), but `docker build` is not one. Building all eight is the operator's or flai serve's to time.
