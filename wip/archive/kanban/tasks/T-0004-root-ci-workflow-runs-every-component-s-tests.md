---
id: T-0004
type: task
nature: improvement
title: Root CI workflow runs every component's tests
status: done
parent: S-0002
owner: alex
created: 2026-10-21T05:15:36Z
updated: 2026-10-21T05:25:13Z
transitions:
  - to: ready
    at: 2026-10-21T05:15:37Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:15:37Z
    by: claude
  - to: done
    at: 2026-10-21T05:25:13Z
    by: claude
stream: S-0002
tags: []
touches: [".github/workflows/ci.yml"]
---
# T-0004 Root CI workflow runs every component's tests

## Work

Write `.github/workflows/ci.yml`: a Node matrix over the nine npm projects running `npm ci && npm test` with lockfile-keyed caching, and a Rust job for portcullis running build, test, and clippy with `-D warnings`.

## Done when

- The workflow file lists every project in `system-flow.yaml` that has tests and `actionlint`-style review finds nothing wrong; it runs on the first push of the branch.

## Notes

The old per-component workflows ran `npm test` only; the integration tier needs Docker and stays out of CI until a runner with Docker is verified, as their comments say.
