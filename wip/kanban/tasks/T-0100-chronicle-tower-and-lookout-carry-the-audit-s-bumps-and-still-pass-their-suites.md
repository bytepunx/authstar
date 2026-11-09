---
id: T-0100
type: task
nature: remediation
title: chronicle, tower, and lookout carry the audit's bumps and still pass their suites
status: done
parent: S-0020
owner: bytepunx
created: 2026-11-09T08:09:43Z
updated: 2026-11-09T08:48:32Z
transitions:
  - to: ready
    at: 2026-11-09T08:19:29Z
    by: agent-S-0020
  - to: in-progress
    at: 2026-11-09T08:19:31Z
    by: agent-S-0020
  - to: done
    at: 2026-11-09T08:48:32Z
    by: agent-S-0020
stream: S-0020
tags: [chronicle, tower, lookout, node, dependencies]
touches: [chronicle/package.json, chronicle/package-lock.json, tower/package.json, tower/package-lock.json, lookout/package.json, lookout/package-lock.json, lookout/spec/integration/events.integration.spec.ts]
usage:
  source: log
  seconds: 1727
  estimated: true
  priced_by: estimate
  models:
    - model: claude-opus-5-5
      input: 28
      output: 129
      cache_read: 2355239
      cache_write: 18441
      cost: 0.8628
---
# T-0100 chronicle, tower, and lookout carry the audit's bumps and still pass their suites

## Work

The forced audit fix bumped these three too, and the story's criterion covers every node project. Bring them to its versions, if the branch does not carry them yet: in chronicle and tower, `vitest` and `@vitest/coverage-v8` `^5.1.0`, `testcontainers` and its `@testcontainers/*` modules `^12.2.1`; in lookout, `vitest` and `@vitest/coverage-v8` `^5.1.0`. The audit downgraded lookout's `testcontainers` and `@testcontainers/rabbitmq` from `^12.1.0` to `^10.10.4`: put them at `^12.2.1` like the others, unless TH-0032 answers otherwise, and fix `lookout/spec/integration/events.integration.spec.ts` if v12 needs it. Approve in each `allowScripts` only the install scripts a suite needs. Regenerate each `package-lock.json` with npm 12 and `npm ci`.

It waits for no task: it changes only these three projects' files.

## Done when

- `npm test` and `npm run test:integration` pass in chronicle, tower, and lookout.
- `npm audit` in each reports no finding the audit fix had cleared.

## Notes
