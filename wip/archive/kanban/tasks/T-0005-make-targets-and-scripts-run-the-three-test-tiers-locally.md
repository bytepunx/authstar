---
id: T-0005
type: task
nature: improvement
title: Make targets and scripts run the three test tiers locally
status: done
parent: S-0002
owner: alex
created: 2026-10-21T05:15:36Z
updated: 2026-10-21T05:25:13Z
transitions:
  - to: ready
    at: 2026-10-21T05:25:12Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:25:12Z
    by: claude
  - to: done
    at: 2026-10-21T05:25:13Z
    by: claude
stream: S-0002
tags: []
touches: [scripts, Makefile]
---
# T-0005 Make targets and scripts run the three test tiers locally

## Work

Replace the template bodies of `scripts/test.sh`, `scripts/integration.sh`, and `scripts/smoke.sh` with loops over the components; add `scripts/install.sh` and a `make install` target for `npm ci` everywhere; update `scripts/README.md`.

## Done when

- `make install && make test` runs every component's behavior and e2e suites on this machine and the result is logged honestly in the narrative.

## Notes

Node 24, npm 11, cargo 1.93, and Docker 29 are on this host.
