---
id: T-0085
type: task
nature: remediation
title: Renumber S-0008's closed duplicate issue from I-0003 to I-0008
status: done
parent: S-0008
owner: alex
created: 2026-11-06T18:17:47Z
updated: 2026-11-06T18:17:57Z
transitions:
  - to: ready
    at: 2026-11-06T18:17:52Z
    by: agent-S-0008
  - to: in-progress
    at: 2026-11-06T18:17:52Z
    by: agent-S-0008
  - to: done
    at: 2026-11-06T18:17:57Z
    by: agent-S-0008
stream: S-0008
tags: []
touches: [design/issues/I-0008-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/I-0003-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md, design/issues/summary.md]
usage:
  source: log
  seconds: 5
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 3
      output: 655
      cache_read: 295053
      cache_write: 3265
      cost: 0.0966
---
# T-0085 Renumber S-0008's closed duplicate issue from I-0003 to I-0008

## Work

- S-0002's merge brought its own I-0003 to main, so S-0008's closed I-0003 now fails `flai check` with `issues.duplicate-id`.
- Rename the file to I-0008 (the next ID free on main, every branch and every worktree), set its `id` and heading, point I-0004's S-0008 instance at I-0008, and regenerate `design/issues/summary.md`.

## Done when

- `flai check --strict --story S-0008` reports no `issues.duplicate-id`.

## Notes

The issue stays closed as a duplicate of I-0004.
