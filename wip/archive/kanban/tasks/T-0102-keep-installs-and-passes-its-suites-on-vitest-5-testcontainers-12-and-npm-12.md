---
id: T-0102
type: task
nature: remediation
title: keep installs and passes its suites on vitest 5, testcontainers 12, and npm 12
status: cancelled
parent: S-0020
owner: alex
created: 2026-11-09T08:17:51Z
updated: 2026-11-09T08:19:20Z
transitions:
  - to: ready
    at: 2026-11-09T08:18:53Z
    by: agent-S-0020
  - to: cancelled
    at: 2026-11-09T08:19:20Z
    by: agent-S-0020
stream: S-0020
tags: [keep, node, dependencies]
touches: [keep/package.json, keep/package-lock.json]
---
# T-0102 keep installs and passes its suites on vitest 5, testcontainers 12, and npm 12

## Work

The worktree already carries main's audit bumps for keep: `vitest` and `@vitest/coverage-v8` `^5.1.0`; `testcontainers`, `@testcontainers/postgresql`, and `@testcontainers/rabbitmq` `^12.2.1`; and an `allowScripts` entry in `keep/package.json`. Keep the `farmhash` approvals (3.3.1 and 5.0.1), which npm 12 needs to build its native module. Drop the approvals of `cpu-features` and `ssh2`, which only speed up testcontainers' SSH, and of `esbuild` and `protobufjs` unless a suite needs them. Regenerate `keep/package-lock.json` with npm 12 if `package.json` changes, `npm ci`, and fix what the suites report, adding the files that fix touches.

It waits for no task: it changes only keep's files.

## Done when

- `npm ci` in keep builds farmhash's `.node` binary under npm 12 with no install script run by hand.
- `npm test` and `npm run test:integration` in keep pass.
- `npm audit` in keep reports no high or critical advisory.

## Notes
- 2026-11-09T08:19:20Z: moved to cancelled: duplicates the planner's task drafted at the same time; kept the planner's (TH-0033)
