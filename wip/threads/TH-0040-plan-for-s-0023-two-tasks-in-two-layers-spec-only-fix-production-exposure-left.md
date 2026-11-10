---
id: TH-0040
title: "Plan for S-0023: two tasks in two layers; spec-only fix, production exposure left to you"
anchor:
  path: wip/kanban/stories/S-0023-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md
  item: S-0023
status: open
participants: [planner-S-0023]
created: 2026-11-09T22:11:49Z
updated: 2026-11-09T22:11:49Z
---

# TH-0040 Plan for S-0023: two tasks in two layers; spec-only fix, production exposure left to you

On wip/kanban/stories/S-0023-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md.

## Entries

### 2026-11-09T22:11:49Z planner-S-0023
S-0023 is planned with two tasks in two layers, a forecast of 1h30m, and a cost of delay of 25 USD a week.

## Note on this run

My start prompt said the operator had written on a thread named `asked` since an earlier plan. No such thread exists, S-0023 had no thread and no earlier plan, so I planned it from the start.

## Proposed cause

`node-flakes` 2.1.0 throws `NTP clock skew detected` whenever `Date.now()` reads earlier than the last id its generator made. consequent 2.0.1 makes one generator per `initialize()` and calls it on every `handle`, with no way to inject a clock or an id generator. No herald spec fakes the clock, so the failing case saw a real backward step of the wall clock. The host's WSL2 time sync makes that likely. T-0126 confirms this before anything is fixed.

## Tasks

| Layer | Task | Waits for | Touches |
|-------|------|-----------|---------|
| 1 | T-0126 Reproduce the clock-skew throw in herald and keep the spec clock monotonic | none | `herald/spec/lib/monotonic-clock.ts`, `herald/spec/behavior/clock-skew.spec.ts`, `herald/vitest.config.ts` |
| 2 | T-0127 Record the clock-skew finding in herald's TESTING.md and close I-0018 | T-0126, whose fix it records and closes the issue on | `herald/TESTING.md`, `design/issues/I-0018-…md`, `design/issues/summary.md` |

## Assumptions

- The fix belongs in herald's tests only: a vitest setup file keeps `Date.now()` monotonic, and a new behavior spec steps the clock back to prove it. `herald/src` is untouched.
- The story covers herald only, as I-0018 does.
- The forecast is raised from flai's 9m to 1h30m because each herald test run takes 8 to 10 minutes (I-0010).
- The cost of delay value of 25 USD a week comes from the operator's input of 10m per cycle. I left it unchanged.

## Questions

Neither question blocks the plan.

1. Production exposure. herald, keep, and tower all run consequent in production, and a backward clock step there makes `handle` throw too. I recommend a separate story to make `node-flakes` keep to its last time instead of throwing, then update its version in the four services. Should I leave that to an issue you file, or should S-0023 grow to cover it?
2. keep, tower, and lookout's suites have the same exposure. I recommend leaving them out of S-0023 until one of them flakes the same way. Say if you want the setup file copied to them now.
