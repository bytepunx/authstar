---
id: T-0113
type: task
nature: remediation
title: make install fails on a blocked unreviewed install script or a missing farmhash build
status: done
parent: S-0021
owner: bytepunx
created: 2026-11-09T22:09:32Z
updated: 2026-11-14T10:38:29Z
transitions:
  - to: ready
    at: 2026-11-14T10:28:36Z
    by: agent-S-0021
  - to: in-progress
    at: 2026-11-14T10:28:36Z
    by: agent-S-0021
  - to: done
    at: 2026-11-14T10:38:29Z
    by: agent-S-0021
stream: S-0021
tags: [hook]
touches: [scripts/install.sh, scripts/check-install-scripts.sh, scripts/README.md, design/tech/npm.md]
after: [T-0112]
usage:
  source: log
  seconds: 593
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 28
      output: 3948
      cache_read: 2791270
      cache_write: 34502
      cost: 0.8748
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

npm 12.2.2 reports a blocked script with no decision in `npm install-scripts ls --json` as a change `pending`, and exits 0 either way, so the guard parses the JSON. It loads every installed farmhash copy by path, since `require('farmhash')` from the project root reaches only the hoisted one.

Reproduction 1. Herald's `package.json` and `package-lock.json` were copied to the git-ignored `bin/S-0021/repro/herald`, `farmhash@3.3.1` was removed from `allowScripts`, and `npm ci` ran there. `npm install-scripts ls --json` printed `{"allowScripts":[{"name":"farmhash","changes":[{"key":"farmhash@3.3.1","change":"pending"}]}]}` and exited 0.

```text
$ scripts/check-install-scripts.sh bin/S-0021/repro/herald
check-install-scripts: bin/S-0021/repro/herald: npm blocked the install scripts of farmhash@3.3.1, which allowScripts neither approves nor denies.
  In bin/S-0021/repro/herald, run npm install-scripts approve <pkg> or npm install-scripts deny <pkg>, then make install again (design/tech/npm.md).
  farmhash@3.3.1 (node_modules/farmhash) does not load: Cannot find module './build/Debug/farmhash.node'
check-install-scripts: bin/S-0021/repro/herald: farmhash's native module does not load after the install.
  Approve the farmhash version npm installs in bin/S-0021/repro/herald's allowScripts (npm install-scripts approve farmhash), then make install again (design/tech/npm.md).
exit 1
```

Reproduction 2 tests the load check alone. Herald was copied with its approvals, `npm ci` ran, and then farmhash's build was removed.

```text
$ rm -rf bin/S-0021/repro2/herald/node_modules/farmhash/build; scripts/check-install-scripts.sh bin/S-0021/repro2/herald
  farmhash@3.3.1 (node_modules/farmhash) does not load: Cannot find module './build/Debug/farmhash.node'
check-install-scripts: bin/S-0021/repro2/herald: farmhash's native module does not load after the install.
  Approve the farmhash version npm installs in bin/S-0021/repro2/herald's allowScripts (npm install-scripts approve farmhash), then make install again (design/tech/npm.md).
exit 1
```

On the worktree, `scripts/check-install-scripts.sh herald keep tower chart/hook` exits 0, and `make install` with the guard exits 0.
