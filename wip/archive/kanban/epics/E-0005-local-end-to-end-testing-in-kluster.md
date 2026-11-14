---
id: E-0005
type: epic
nature: feature
title: Local end-to-end testing in kluster
status: done
owner: bytepunx
created: 2026-11-09T06:50:31Z
updated: 2026-11-14T08:26:32Z
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
  - to: done
    at: 2026-11-14T08:26:32Z
    by: bytepunx
tags: []
usage:
  source: sum
  seconds: 6791
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
      ceremony: 7
      test_runs: 11
      work: 47
  models:
    - model: claude-opus-5-5
      input: 718
      output: 191994
      cache_read: 57838307
      cache_write: 1437565
      cost: 26.3906
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
      seconds: 351
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 183
          output: 1308
          cache_read: 5313403
          cache_write: 985236
          cost: 7.204
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
- 2026-11-14T08:26:32Z: moved to done: follows S-0025, which moved to done
