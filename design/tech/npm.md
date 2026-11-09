---
title: npm and install-script approvals
updated: 2026-11-09
status: active
topics: [node, sveltekit]
---

# npm

Every Node project installs from its committed `package-lock.json` with `npm ci` (`scripts/install.sh`, `make install`). This host runs npm 12.2.2 with Node 24.

## Install scripts need approval

npm 12 runs no dependency's install script unless the project's `package.json` approves it in `allowScripts`. An unapproved script is blocked: the package installs, but nothing it would build or download at install time exists, and `npm ci` warns about it. An explicit `false` records that the script was considered and denied, and silences the warning.

Approve or deny with `npm install-scripts approve <pkg>` or `npm install-scripts deny <pkg>` in the project's folder. The command refuses the whole call with `ENOMATCH` when the project does not install a package it names. It writes `package.json` even with `--dry-run`.

## What each project approves

| Project | Approved | Denied |
|---------|----------|--------|
| herald | `farmhash@3.3.1`, `farmhash@5.0.1` | `cpu-features`, `esbuild`, `protobufjs`, `ssh2` |
| keep | `farmhash@3.3.1`, `farmhash@5.0.1` | `cpu-features`, `esbuild`, `protobufjs`, `ssh2` |
| chronicle | none | `cpu-features`, `esbuild`, `protobufjs`, `ssh2` |
| lookout | none | `cpu-features`, `esbuild`, `protobufjs`, `ssh2` |
| web | none | `esbuild`, `protobufjs` |
| steward | none | `esbuild`, `protobufjs` |
| tower | `cpu-features@0.0.10`, `esbuild@0.28.1`, `farmhash@3.3.1`, `fsevents@2.3.3`, `protobufjs@7.6.5`, `ssh2@1.17.0` | none |
| clients/typescript | `esbuild@0.27.7` | none |
| chart/hook | none | none |

## Why

- `farmhash` 3.3.1 builds a native module at install time, and herald and keep load it through `consequent` and `haberdasher`. Without the approval their suites fail with `Cannot find module './build/Debug/farmhash.node'`. 5.0.1, through `node-flakes`, ships prebuilt binaries and builds nothing, but is approved with it.
- The other scripts are denied because no build or suite needs them. `esbuild` and `protobufjs` only check or download a binary that their packages already resolve without the script. `ssh2` and `cpu-features` only speed up testcontainers' SSH connections ([testcontainers.md](testcontainers.md)).
- tower keeps the entry it had before S-0020, which was written before the audit fix and works.
- chart/hook installs `esbuild@0.21.5` and `protobufjs@7.6.6` with no entry, so `npm ci` warns that their scripts are blocked. Its suite passes without them.
