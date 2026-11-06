---
id: T-0043
type: task
nature: remediation
title: Close I-0002 naming the rotation fix and its test
status: backlog
parent: S-0016
owner: bytepunx
created: 2026-11-06T18:07:24Z
updated: 2026-11-06T18:07:24Z
transitions: []
stream: S-0016
tags: [tower, issues]
touches: [design/issues/I-0002-tower-s-spiffe-svid-is-fetched-once-at-boot-and-expires-after-4h.md, design/issues/summary.md]
after: [T-0041, T-0042]
---
# T-0043 Close I-0002 naming the rotation fix and its test

## Work

Close I-0002 from the story's worktree with `flai issue close I-0002 --commit --reason "<reason>"`. The reason says that tower applies each SVID SPIRE pushes with `setSecureContext` (commit 5f77cad, made testable by T-0040), and that `tower/spec/behavior/spiffe-svid-rotation.spec.ts` (T-0041) reproduces the expiry and proves the rotation.

The instance cites bytepunx/authstar-tower#4. Closing that GitHub issue is the operator's: name it in the story's Notes for them.

It waits for T-0041 and T-0042, because the reason cites the passing test and the corrected docs.

## Done when

- `flai issue show I-0002` reports it closed, with a reason naming the fix and the test.
- `design/issues/summary.md` no longer counts I-0002 as open.
- The story's Notes ask the operator to close bytepunx/authstar-tower#4.

## Notes
