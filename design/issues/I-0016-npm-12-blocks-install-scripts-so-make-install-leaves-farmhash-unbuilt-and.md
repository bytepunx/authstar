---
id: I-0016
title: npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail
class: defect
status: open
count: 1
cost: 20m
first_reported: 2026-11-09T07:17:12Z
last_reported: 2026-11-09T07:17:12Z
updated: 2026-11-09T07:17:12Z
---

# I-0016 npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail

## Description
npm 12 blocks install scripts, so make install leaves farmhash unbuilt and herald, keep, and tower's tests fail

## Instances

### 2026-11-09T07:17:12Z
Story: S-0011.
In S-0011's worktree, `scripts/install.sh` (npm 12.2.2, node 24.21.0) ran `npm ci`, which blocked the install scripts of cpu-features, esbuild, farmhash, protobufjs, and ssh2 because no `allowScripts` covers them. farmhash 3 then had no `build/Release/farmhash.node` in herald, keep, and tower, and `flai test` failed in their suites with "Cannot find module './build/Debug/farmhash.node'". Running `prebuild-install` in each `node_modules/farmhash` fixed it locally. The S-0006 and S-0008 worktrees and the main checkout lack the build too. A fix is an `allowScripts` entry in each affected package.json, or `npm rebuild` with scripts allowed in `scripts/install.sh`.

## Remediation
