---
id: E-0005
type: epic
nature: feature
title: Local end-to-end testing in kluster
status: review
owner: bytepunx
created: 2026-11-09T06:50:31Z
updated: 2026-11-13T22:02:55Z
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
  - to: review
    at: 2026-11-13T22:02:55Z
    by: agent-S-0025
tags: []
usage:
  source: sum
  seconds: 6408
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 2
      test_runs: 4
      hand_edits: 4
      work: 65
    - day: 2026-11-13
      ceremony: 3
      work: 103
    - day: 2026-11-14
      ceremony: 3
      test_runs: 2
      work: 17
  models:
    - model: claude-opus-5-5
      input: 622
      output: 170142
      cache_read: 55560274
      cache_write: 1286873
      cost: 24.2921
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
      seconds: 312
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 164
          output: 1168
          cache_read: 4837785
          cache_write: 896485
          cost: 6.5505
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
- 2026-11-13T22:02:55Z: moved to review: follows S-0025, which moved to review
