---
id: T-0025
type: task
nature: improvement
title: Check, lint, and test the upgraded repository and tick the criteria
status: done
parent: S-0003
owner: bytepunx
created: 2026-11-06T17:47:53Z
updated: 2026-11-06T17:53:03Z
transitions:
  - to: ready
    at: 2026-11-06T17:51:57Z
    by: agent-S-0003
  - to: in-progress
    at: 2026-11-06T17:51:57Z
    by: agent-S-0003
  - to: done
    at: 2026-11-06T17:53:03Z
    by: agent-S-0003
stream: S-0003
tags: [template, tooling]
touches: [wip/kanban/stories/S-0003-upgrade-the-system-flow-template-from-1-0-16-to-current.md]
after: [T-0023, T-0024]
usage:
  source: log
  seconds: 66
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 35
      output: 6566
      cache_read: 1872117
      cache_write: 56020
      cost: 0.921
---
# T-0025 Check, lint, and test the upgraded repository and tick the criteria

## Work

Run `flai check --strict`, `make check`, `scripts/lint-md.sh` (or `make lint-md`), and `make test` on the upgraded tree. Fix what each reports in the file it names. A fix that falls outside this story's touches is recorded as an issue in `design/issues`, not made here.

Run `scripts/close-out.sh` once to confirm it runs in this repository, and record its result.

Tick each acceptance criterion of S-0003 only for what was observed. For the fourth criterion, say in the story's Notes that template 1.1.22 adds no `design/system/workflow.md`, and name the files that were filled instead.

## Done when

- `flai check --strict` passes and `make test` runs to the end, each result quoted in the narrative as observed.
- The markdown lint passes, or each remaining finding is recorded with its reason.
- Every criterion of S-0003 is ticked or left unticked with the reason in its Notes.

## Notes

On `main` on 2026-11-06, `scripts/test.sh` is still the template stub. S-0002's component loops are on its unmerged branch. "`make test` still runs" means the target exits 0 with whatever `scripts/test.sh` holds when this task runs.
