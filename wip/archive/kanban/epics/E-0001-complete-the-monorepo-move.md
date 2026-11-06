---
id: E-0001
type: epic
nature: improvement
title: Complete the monorepo move
status: done
owner: alex
created: 2026-10-21T04:58:53Z
updated: 2026-11-06T17:56:15Z
transitions:
  - to: ready
    at: 2026-10-21T04:58:53Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:05:27Z
    by: claude
  - to: review
    at: 2026-11-06T17:53:32Z
    by: agent-S-0003
  - to: done
    at: 2026-11-06T17:56:15Z
    by: bytepunx
tags: []
usage:
  source: sum
  seconds: 378
  priced_by: harness
  turns:
    - day: 2026-11-06
      ceremony: 1
      test_runs: 3
      hand_edits: 1
      work: 48
  models:
    - model: claude-opus-5-5
      input: 128
      output: 23957
      cache_read: 6830419
      cache_write: 204389
      cost: 3.3601
  strategic:
    - kind: orchestrator
      seconds: 64
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 49
          output: 325
          cache_read: 1207604
          cache_write: 196742
          cost: 1.4739
---
# E-0001 Complete the monorepo move

## Outcome

One repository, `bytepunx/authstar`, holds every authstar component including the `integration` harness, with a remote, CI that runs every component's tests on push, design records the system-flow standard can check, and a board that carries the work. The per-component GitHub repositories become read-only history.

## Stories
- S-0001 Land the scaffolding, fold the design records in, and import integration
- S-0002 Root CI and Make targets run every component's tests
- S-0003 Upgrade the system-flow template from 1.0.16 to current

## Notes

Found on 2026-10-20: the components were imported on 2026-09-23 but the scaffolding was never committed, there was no remote, the design docs were template text, `flai check --strict` failed with 194 warnings, per-component CI was orphaned in subdirectories, and `integration` was left out.
- 2026-10-21T04:58:53Z: moved to ready: follows S-0001, which moved to ready
- 2026-10-21T05:05:27Z: moved to in-progress: follows S-0001, which moved to in-progress
- 2026-11-06T17:53:32Z: moved to review: follows S-0003, which moved to review
- 2026-11-06T17:56:15Z: moved to done: follows S-0003, which moved to done
