---
id: T-0079
type: task
nature: remediation
title: Close I-0001 naming the trust-bundle agents and their specs
status: done
parent: S-0015
owner: bytepunx
created: 2026-11-06T18:10:30Z
updated: 2026-11-14T10:41:06Z
transitions:
  - to: ready
    at: 2026-11-14T10:40:59Z
    by: agent-S-0015
  - to: in-progress
    at: 2026-11-14T10:40:59Z
    by: agent-S-0015
  - to: done
    at: 2026-11-14T10:41:06Z
    by: agent-S-0015
stream: S-0015
tags: [issues]
touches: [design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md, design/issues/summary.md]
after: [T-0077, T-0172]
usage:
  source: log
  seconds: 7
  estimated: true
  priced_by: harness
  models: []
---
# T-0079 Close I-0001 naming the trust-bundle agents and their specs

## Work

Close I-0001 with `flai issue close I-0001 --reason`, which rewrites the issue and `design/issues/summary.md`. The reason names the ADR of T-0054, the four `tower-tls` modules and specs, and the chart change of T-0077. It also says that the issue's instance named tower where the chart set the variable on herald, so a reader of the closed issue finds the right services.

It waits for T-0077: the cause is gone only once the chart no longer sets the variable.

## Done when

- I-0001 is closed, and its reason names the fix and the specs that reproduce the cause.
- `design/issues/summary.md` no longer lists I-0001 as open.
- `flai check --strict` passes.

## Notes
