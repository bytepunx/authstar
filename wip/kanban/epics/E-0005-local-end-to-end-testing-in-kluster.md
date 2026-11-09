---
id: E-0005
type: epic
nature: feature
title: Local end-to-end testing in kluster
status: ready
owner: bytepunx
created: 2026-11-09T06:50:31Z
updated: 2026-11-09T06:51:07Z
transitions:
  - to: ready
    at: 2026-11-09T06:50:32Z
    by: bytepunx
tags: []
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: orchestrator
      seconds: 82
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 26
          output: 187
          cache_read: 754661
          cache_write: 137062
          cost: 1.0304
---
# E-0005 Local end-to-end testing in kluster

## Outcome

Get a full authstar deploy working in kluster via the Ops/Deployments tooling.

## Stories
- S-0019 Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block

## Notes
