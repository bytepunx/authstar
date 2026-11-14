---
id: T-0139
type: task
nature: remediation
title: I-0007 is closed once the golden path passes on a running harness
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-13T22:23:40Z
updated: 2026-11-14T08:41:36Z
transitions:
  - to: ready
    at: 2026-11-14T08:41:29Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-14T08:41:29Z
    by: agent-S-0017
  - to: done
    at: 2026-11-14T08:41:36Z
    by: agent-S-0017
stream: S-0017
tags: []
touches: [design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md, design/issues/summary.md]
after: [T-0111]
usage:
  source: log
  seconds: 7
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 3
      output: 907
      cache_read: 465516
      cache_write: 7861
      cost: 0.1633
---
# T-0139 I-0007 is closed once the golden path passes on a running harness

## Work

Split from T-0111, so the README could be committed before the live run, which needs a clean worktree to deploy.

- Once criterion 4 is verified on a running harness, close I-0007 with `flai issue close --commit`. The resolution names S-0017 and the live run.
- When no run passes, leave I-0007 open and say why in the Notes.

## Done when

- I-0007 is closed with a resolution naming the live run, or the Notes say why it stays open.

## Notes
