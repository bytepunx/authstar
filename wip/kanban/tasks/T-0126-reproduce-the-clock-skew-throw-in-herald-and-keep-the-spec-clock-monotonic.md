---
id: T-0126
type: task
nature: remediation
title: Reproduce the clock-skew throw in herald and keep the spec clock monotonic
status: backlog
parent: S-0023
owner: bytepunx
created: 2026-11-09T22:11:27Z
updated: 2026-11-09T22:11:27Z
transitions: []
stream: S-0023
tags: [herald, testing]
touches: [herald/spec/lib/monotonic-clock.ts, herald/spec/behavior/clock-skew.spec.ts, herald/vitest.config.ts]
---
# T-0126 Reproduce the clock-skew throw in herald and keep the spec clock monotonic

## Work

Waits for no task: it is the first layer.

1. Write `herald/spec/behavior/clock-skew.spec.ts`. On one `buildInMemoryConsequent()` instance, run a command, step the wall clock back by a few milliseconds, and run a second command. Run it before the fix and record in this task's `## Notes` that it fails with `Error: NTP clock skew detected` from `node-flakes`. If it does not fail, stop and say so on the plan's thread: the proposed cause in the story's `### Planning` is then wrong.
2. Write `herald/spec/lib/monotonic-clock.ts`, a vitest setup module that wraps `Date.now()` so that it never returns less than the last value it returned. Give it a way for the reproduction spec to step the clock beneath the wrapper, so that the spec exercises the real wrapper rather than replacing it.
3. Name the module in `setupFiles` in `herald/vitest.config.ts`, so that the behavior, e2e, and integration runs all load it.
4. Run herald's behavior and e2e tiers with `flai test` on the paths changed.

Leave `herald/src` alone: the production exposure is the operator's to decide on the plan's thread.

## Done when

- `herald/spec/behavior/clock-skew.spec.ts` fails with `NTP clock skew detected` without the setup module and passes with it, and this task's `## Notes` record both runs.
- `herald/vitest.config.ts` names `herald/spec/lib/monotonic-clock.ts` in `setupFiles`.
- `flai test` passes on the changed paths, including `herald/spec/behavior/retention-purge.spec.ts` unchanged.

## Notes
