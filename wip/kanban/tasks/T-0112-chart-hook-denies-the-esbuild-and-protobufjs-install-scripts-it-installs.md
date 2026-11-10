---
id: T-0112
type: task
nature: remediation
title: chart/hook denies the esbuild and protobufjs install scripts it installs
status: backlog
parent: S-0021
owner: bytepunx
created: 2026-11-09T22:09:23Z
updated: 2026-11-09T22:09:23Z
transitions: []
stream: S-0021
tags: [hook]
touches: [chart/hook/package.json, design/tech/npm.md]
---
# T-0112 chart/hook denies the esbuild and protobufjs install scripts it installs

## Work

chart/hook is the one npm project with no `allowScripts` entry. Its `npm ci` warns that the scripts of `esbuild@0.21.5` and `protobufjs@7.6.6` are blocked ([design/tech/npm.md](../../../design/tech/npm.md)). Its suite passes without them, so deny both. In `chart/hook`, run `npm install-scripts deny esbuild protobufjs`. It writes `package.json` even with `--dry-run`, so run it only in the story's worktree. Check that `npm ci` in chart/hook no longer warns of a blocked script. Then change chart/hook's row in `design/tech/npm.md` to list the two packages as denied.

This task waits for no other: the guard in the next task fails on any warning, so chart/hook must be clean first.

## Done when

- `chart/hook/package.json` has an `allowScripts` entry that denies `esbuild` and `protobufjs`.
- `npm ci` in chart/hook prints no blocked-script warning.
- chart/hook's suite passes with `flai test chart/hook`.
- `design/tech/npm.md` lists esbuild and protobufjs as denied for chart/hook.

## Notes
