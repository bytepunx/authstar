---
id: T-0103
type: task
nature: remediation
title: chronicle, lookout, and tower install and pass their suites on vitest 5 and testcontainers 12
status: cancelled
parent: S-0020
owner: alex
created: 2026-11-09T08:17:53Z
updated: 2026-11-09T08:19:21Z
transitions:
  - to: ready
    at: 2026-11-09T08:18:53Z
    by: agent-S-0020
  - to: cancelled
    at: 2026-11-09T08:19:21Z
    by: agent-S-0020
stream: S-0020
tags: [chronicle, lookout, tower, node, dependencies]
touches: [chronicle/package.json, chronicle/package-lock.json, lookout/package.json, lookout/package-lock.json, tower/package.json, tower/package-lock.json]
---
# T-0103 chronicle, lookout, and tower install and pass their suites on vitest 5 and testcontainers 12

## Work

The worktree already carries main's audit bumps for chronicle, lookout, and tower. lookout's audit fix moved testcontainers down from `^12.1.0` to `^10.10.4`: set `testcontainers` and `@testcontainers/rabbitmq` back to `^12.2.1`, as in every other service. In each `allowScripts`, drop the approvals of `cpu-features` and `ssh2`, which only speed up testcontainers' SSH, and of `esbuild` and `protobufjs` unless a suite needs them; tower's entry was there before the audit fix, so change it only if a suite needs it. Regenerate each lockfile with npm 12 where `package.json` changes, `npm ci`, and fix what the suites report, adding the files that fix touches.

It waits for no task: it changes only these three projects' files.

## Done when

- `npm ci`, `npm test`, and `npm run test:integration` pass in chronicle, lookout, and tower under npm 12.
- `npm audit` in each reports no high or critical advisory.

## Notes
- 2026-11-09T08:19:21Z: moved to cancelled: duplicates the planner's task drafted at the same time; kept the planner's (TH-0033)
