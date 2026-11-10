---
id: T-0114
type: task
nature: remediation
title: herald, keep, and tower pass from a clean make install, and I-0016 is closed
status: backlog
parent: S-0021
owner: bytepunx
created: 2026-11-09T22:09:38Z
updated: 2026-11-09T22:09:38Z
transitions: []
stream: S-0021
tags: [hook]
touches: [design/issues/I-0016-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md, design/issues/summary.md]
after: [T-0113]
---
# T-0114 herald, keep, and tower pass from a clean make install, and I-0016 is closed

## Work

In the story's worktree, remove every npm project's `node_modules` and run `make install`. Then run herald's, keep's, and tower's suites with `flai test herald keep tower`. They must pass without the `Cannot find module './build/Debug/farmhash.node'` that I-0016 records. Then close the issue. Name in the reason the S-0020 approvals that fixed the cause and the guard T-0113 added:

```sh
flai issue close I-0016 --reason "<what fixed it>"
```

This task waits for T-0113: the clean install must run through the guard, and the reason names it.

## Done when

- A clean `make install` exits 0 in the worktree.
- `flai test herald keep tower` passes.
- I-0016 is closed with a reason naming S-0020's farmhash approvals and the `make install` guard, and `design/issues/summary.md` no longer lists it as open.

## Notes
