---
id: E-0001
type: epic
nature: improvement
title: Complete the monorepo move
status: ready
owner: alex
created: 2026-10-21T04:58:53Z
updated: 2026-10-21T04:58:53Z
transitions:
  - to: ready
    at: 2026-10-21T04:58:53Z
    by: claude
tags: []
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
