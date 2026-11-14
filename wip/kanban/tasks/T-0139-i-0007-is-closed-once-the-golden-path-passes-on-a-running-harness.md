---
id: T-0139
type: task
nature: remediation
title: I-0007 is closed once the golden path passes on a running harness
status: backlog
parent: S-0017
owner: bytepunx
created: 2026-11-13T22:23:40Z
updated: 2026-11-13T22:23:40Z
transitions: []
stream: S-0017
tags: []
touches: [design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md, design/issues/summary.md]
after: [T-0111]
---
# T-0139 I-0007 is closed once the golden path passes on a running harness

## Work

Split from T-0111, so the README could be committed before the live run, which needs a clean worktree to deploy.

- Once criterion 4 is verified on a running harness, close I-0007 with `flai issue close --commit`. The resolution names S-0017 and the live run.
- When no run passes, leave I-0007 open and say why in the Notes.

## Done when

- I-0007 is closed with a resolution naming the live run, or the Notes say why it stays open.

## Notes
