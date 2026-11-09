---
id: T-0096
type: task
nature: remediation
title: herald installs and passes its suites on vitest 5, testcontainers 12, and npm 12
status: done
parent: S-0020
owner: bytepunx
created: 2026-11-09T08:08:37Z
updated: 2026-11-09T08:48:19Z
transitions:
  - to: ready
    at: 2026-11-09T08:18:53Z
    by: agent-S-0020
  - to: in-progress
    at: 2026-11-09T08:19:30Z
    by: agent-S-0020
  - to: done
    at: 2026-11-09T08:48:19Z
    by: agent-S-0020
stream: S-0020
tags: [herald, node, dependencies]
touches: [herald/package.json, herald/package-lock.json, herald/vitest.config.ts, herald/spec/integration/rabbitmq.integration.spec.ts, herald/spec/integration/herald.integration.spec.ts]
usage:
  source: log
  seconds: 1729
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 10
      output: 2275
      cache_read: 900814
      cache_write: 29117
      cost: 0.3857
---
# T-0096 herald installs and passes its suites on vitest 5, testcontainers 12, and npm 12

## Work

Bring herald to the versions the forced audit fix chose, if the branch does not carry them yet: `vitest` and `@vitest/coverage-v8` `^5.1.0`; `testcontainers`, `@testcontainers/postgresql`, and `@testcontainers/rabbitmq` `^12.2.1`. Give `herald/package.json` an `allowScripts` entry approving `farmhash` (both installed versions, 3.3.1 and 5.0.1), so that npm 12 builds its native module; deny or leave out `cpu-features` and `ssh2`, which only speed up testcontainers' SSH, and approve `esbuild` and `protobufjs` only if a suite needs them. Regenerate `herald/package-lock.json` with npm 12, then `npm ci` and fix what the suites report: vitest 5's config and API changes in `herald/vitest.config.ts`, and testcontainers 12's in the two integration specs.

It waits for no task: it changes only herald's files.

## Done when

- `npm ci` in herald builds farmhash's `.node` binary under npm 12 with no install script run by hand.
- `npm test` and `npm run test:integration` in herald pass.

## Notes
