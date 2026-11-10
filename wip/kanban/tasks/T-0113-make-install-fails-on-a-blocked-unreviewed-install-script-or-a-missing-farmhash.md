---
id: T-0113
type: task
nature: remediation
title: make install fails on a blocked unreviewed install script or a missing farmhash build
status: backlog
parent: S-0021
owner: bytepunx
created: 2026-11-09T22:09:32Z
updated: 2026-11-09T22:09:32Z
transitions: []
stream: S-0021
tags: [hook]
touches: [scripts/install.sh, scripts/check-install-scripts.sh, scripts/README.md, design/tech/npm.md]
after: [T-0112]
---
# T-0113 make install fails on a blocked unreviewed install script or a missing farmhash build

## Work

Write `scripts/check-install-scripts.sh`, in POSIX `sh` under `set -eu`, and call it from `scripts/install.sh` after each project's `npm ci`. It fails, naming the project and the package, in two cases:

- npm blocked an install script that the project's `allowScripts` neither approves nor denies. Find out how npm 12.2.2 reports this, from `npm ci`'s warning or a command that lists blocked scripts, and record it in `design/tech/npm.md`.
- In herald, keep, or tower, farmhash's native module does not load after the install, for example when `node -e "require('farmhash')"` fails in the project's folder.

To reproduce I-0016, copy herald to a scratch location, remove its `farmhash@3.3.1` approval, and run the check against the copy. It must exit non-zero and name herald and farmhash. Write the command and its output in this task's Notes. Add the script to the table in `scripts/README.md`. Add a section on the guard to `design/tech/npm.md`, saying what to do when it fails: approve or deny the package, then run `make install` again.

This task waits for T-0112: until chart/hook denies esbuild and protobufjs, the guard would fail `make install` on chart/hook's warning.

## Done when

- `make install` exits non-zero and names the project and package when a blocked install script has no `allowScripts` decision.
- `make install` exits non-zero when farmhash does not load in herald, keep, or tower.
- The reproduction with herald's farmhash approval removed fails as above, and its command and output are in this task's Notes.
- `make install` on the worktree as committed exits 0.
- `scripts/README.md` lists `check-install-scripts.sh`, and `design/tech/npm.md` describes the guard.

## Notes
