---
id: T-0023
type: task
nature: improvement
title: Merge the 8 conflicted files with the template's 1.1.22 text by hand
status: done
parent: S-0003
owner: bytepunx
created: 2026-11-06T17:47:38Z
updated: 2026-11-06T17:50:33Z
transitions:
  - to: ready
    at: 2026-11-06T17:49:18Z
    by: agent-S-0003
  - to: in-progress
    at: 2026-11-06T17:49:18Z
    by: agent-S-0003
  - to: done
    at: 2026-11-06T17:50:33Z
    by: agent-S-0003
stream: S-0003
tags: [template, tooling]
touches: [design/README.md, design/adrs/README.md, design/issues/summary.md, design/system/overview.md, design/tech/README.md, docs/contributors/index.md, wip/agents/index.md, wip/kanban/board.md]
after: [T-0021]
usage:
  source: log
  seconds: 75
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 9
      output: 1758
      cache_read: 501190
      cache_write: 14997
      cost: 0.2466
---
# T-0023 Merge the 8 conflicted files with the template's 1.1.22 text by hand

## Work

For each file `flai upgrade` reported as a conflict, diff the project's version against the template's text at the applied release. The files are `design/README.md`, `design/adrs/README.md`, `design/issues/summary.md`, `design/system/overview.md`, `design/tech/README.md`, `docs/contributors/index.md`, `wip/agents/index.md`, and `wip/kanban/board.md`. Take the template's new structure, sections, and front matter fields, and keep the project's own content:

- the ADR index rows from 0001 to 0106
- the open issues
- the system overview's parts and principles
- the tech stack link
- the contributor guide's test instructions
- the active streams
- the board's `wip_limits`, `order`, and `placed`

Make no flai-managed edit to `wip/agents/index.md` or `wip/kanban/board.md` by hand where a `flai` command writes it. Prefer the project's values and run `flai check` after each.

For `design/adrs/README.md`, finish with `flai adr index`. On 2026-11-06, `flai check` warned that rows 0007, 0013, 0037, 0042, 0050, 0064, 0090, and 0098, the superseded ADRs, differ from what their files render.

Record each file's resolution in the narrative's `## Decisions`, one line each: what came from the template, what stayed, and why.

## Done when

- Each of the 8 files carries the template's 1.1.22 structure and the project's content, with nothing left as template placeholder text.
- `flai board` shows the same WIP limits and order as before the upgrade.
- `flai check --strict` reports nothing on these files, the `adr.index` warning included.
- The narrative's `## Decisions` has one line per file.

## Notes

If S-0002's work reaches `main` before this story, `Makefile`, `scripts/README.md`, and `scripts/check.sh` join this list. Their resolution keeps S-0002's targets and scripts.

S-0008, in progress on 2026-11-06, also touches `design/adrs/README.md` and `design/system/overview.md`. Whichever story lands second merges on top of the other's version.
