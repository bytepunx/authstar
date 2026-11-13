---
id: E-0005
type: epic
nature: feature
title: Local end-to-end testing in kluster
status: in-progress
owner: bytepunx
created: 2026-11-09T06:50:31Z
updated: 2026-11-09T23:37:51Z
transitions:
  - to: ready
    at: 2026-11-09T06:50:32Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-09T21:57:38Z
    by: agent-S-0019
  - to: review
    at: 2026-11-09T22:46:00Z
    by: agent-S-0019
  - to: in-progress
    at: 2026-11-09T22:49:35Z
    by: bytepunx
tags: []
usage:
  source: sum
  seconds: 2917
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 2
      test_runs: 4
      hand_edits: 4
      work: 65
  models:
    - model: claude-opus-5-5
      input: 306
      output: 99163
      cache_read: 29078429
      cache_write: 426602
      cost: 10.7836
  strategic:
    - kind: planner
      seconds: 8893
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 112
          output: 25666
          cache_read: 6927479
          cache_write: 135227
          cost: 2.9811
    - kind: orchestrator
      seconds: 237
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 112
          output: 792
          cache_read: 3499773
          cache_write: 632470
          cost: 4.7094
---
# E-0005 Local end-to-end testing in kluster

## Outcome

Get a full authstar deploy working in kluster via the Ops/Deployments tooling.

## Stories
- S-0019 Write the project's kluster build, deploy, and teardown scripts and name them in the kluster: block
- S-0025 A story in review deploys into its own kluster namespace and its teardown removes it

## Notes
- 2026-11-09T21:57:38Z: moved to in-progress: follows S-0019, which moved to in-progress
- 2026-11-09T22:46:00Z: moved to review: follows S-0019, which moved to review
- 2026-11-09T22:49:35Z: moved to in-progress: follows S-0019, which moved to in-progress
