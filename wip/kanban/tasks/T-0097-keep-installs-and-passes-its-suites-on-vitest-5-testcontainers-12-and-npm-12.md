---
id: T-0097
type: task
nature: remediation
title: keep installs and passes its suites on vitest 5, testcontainers 12, and npm 12
status: done
parent: S-0020
owner: bytepunx
created: 2026-11-09T08:09:27Z
updated: 2026-11-09T08:48:28Z
transitions:
  - to: ready
    at: 2026-11-09T08:19:29Z
    by: agent-S-0020
  - to: in-progress
    at: 2026-11-09T08:19:30Z
    by: agent-S-0020
  - to: done
    at: 2026-11-09T08:48:28Z
    by: agent-S-0020
stream: S-0020
tags: [keep, node, dependencies]
touches: [keep/package.json, keep/package-lock.json, keep/vitest.config.ts, keep/spec/integration/plan-mappings.integration.spec.ts, keep/spec/integration/entitlement-publishing.integration.spec.ts]
usage:
  source: log
  seconds: 1728
  estimated: true
  priced_by: estimate
  models:
    - model: claude-opus-5-5
      input: 16
      output: 170
      cache_read: 1373922
      cache_write: 11780
      cost: 0.5037
---
# T-0097 keep installs and passes its suites on vitest 5, testcontainers 12, and npm 12

## Work

Bring keep to the versions the forced audit fix chose, if the branch does not carry them yet: `vitest` and `@vitest/coverage-v8` `^5.1.0`; `testcontainers`, `@testcontainers/postgresql`, and `@testcontainers/rabbitmq` `^12.2.1`. Give `keep/package.json` an `allowScripts` entry approving `farmhash` (both installed versions, 3.3.1 and 5.0.1), so that npm 12 builds its native module; deny or leave out `cpu-features` and `ssh2`, and approve `esbuild` and `protobufjs` only if a suite needs them. Regenerate `keep/package-lock.json` with npm 12, then `npm ci` and fix what the suites report: vitest 5's config and API changes in `keep/vitest.config.ts`, and testcontainers 12's in the two integration specs.

If S-0008 lands its own farmhash approval in `keep/package.json` first (TH-0030), keep its entry and add only what is missing.

It waits for no task: it changes only keep's files.

## Done when

- `npm ci` in keep builds farmhash's `.node` binary under npm 12 with no install script run by hand.
- `npm test` and `npm run test:integration` in keep pass.

## Notes
