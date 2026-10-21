---
id: T-0003
type: task
nature: improvement
title: Verify a fresh clone passes the strict check
status: done
parent: S-0001
owner: alex
created: 2026-10-21T05:07:30Z
updated: 2026-10-21T05:10:56Z
transitions:
  - to: ready
    at: 2026-10-21T05:10:07Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:10:07Z
    by: claude
  - to: done
    at: 2026-10-21T05:10:56Z
    by: claude
stream: S-0001
tags: []
---
# T-0003 Verify a fresh clone passes the strict check

## Work

Clone `story/S-0001` into the scratch directory and run `flai check --strict` there, so ignore rules and untracked files cannot hide a failure.

## Done when

- The fresh clone's check exits 0 and the result is logged in the narrative.

## Notes

Required by `design/conventions/git.md`: a fresh clone must build and pass the strict check.
