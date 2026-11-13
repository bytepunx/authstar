---
id: S-0023
type: story
nature: remediation
title: "Herald's retention-purge spec fails intermittently with \"NTP clock skew detected\" from node-flakes"
status: backlog
owner: bytepunx
created: 2026-11-09T09:04:34Z
updated: 2026-11-13T21:36:02Z
transitions: []
tags: [herald, testing]
topics: [testing]
touches: [herald/spec/lib/monotonic-clock.ts, herald/spec/behavior/clock-skew.spec.ts, herald/vitest.config.ts, herald/TESTING.md, design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md, design/issues/summary.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: orchestrator
      seconds: 18
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 8
          output: 59
          cache_read: 300883
          cache_write: 42159
          cost: 0.3919
cost_of_delay:
  inputs:
    time_lost_per_cycle: 10m
    by: flai
    at: 2026-11-09T09:04:34Z
  value: 25
  by: planner-S-0023
  at: 2026-11-09T22:11:11Z
forecast:
  duration: 1h30m
  delivery: 2026-11-14T18:02:00Z
  basis: "Its own forecast of 1h30m; 12th in the pull order with an in-progress limit of 4, behind S-0006, S-0013, S-0025, S-0012, S-0007, S-0008, S-0017, S-0010, S-0014, S-0015, S-0016, S-0018, S-0021 and S-0022."
  by: flai
  at: 2026-11-13T21:36:02Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:47:48Z
---
# S-0023 Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes

## Goal

This story remediates [I-0018](../../../design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md), "Herald's retention-purge spec fails intermittently with "NTP clock skew detected" from node-flakes". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0018 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0018 is closed with `flai issue close I-0018 --reason` saying what fixed it

## Tasks
- T-0126 Reproduce the clock-skew throw in herald and keep the spec clock monotonic
- T-0127 Record the clock-skew finding in herald's TESTING.md and close I-0018

## Notes

Cost of delay inputs set by flai from I-0018. time_lost_per_cycle 10m: 10m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-09T07:58:27Z, 0 days before this story; under one cycle counts as one).

### Planning

Proposed cause, from the code (to be confirmed by the reproduction): `node-flakes` 2.1.0 throws `NTP clock skew detected` whenever `Date.now()` reads earlier than the last id it generated (`herald/node_modules/node-flakes/dist/index.js`, the `now < lastTime` branch). consequent 2.0.1 makes one generator per `initialize()` and calls it in `handle` and `enrichEvent`, with no way to inject a clock or an id generator. No herald spec fakes or sets the clock, so the failing case saw a real backward step of the wall clock between two ids, which the host's WSL2 time sync makes likely. The spec itself is not wrong.

Proposed fix: keep `Date.now()` monotonic in herald's test process, through a vitest setup file named in `herald/vitest.config.ts`, and prove it with a spec that steps the clock back between two commands on one in-memory consequent. Production code is left alone: wrapping `Date.now()` in the service is not this story's to decide. The production exposure, and the same exposure in keep, tower, and lookout's suites, are raised on the plan's thread.

Touches, all predicted, none declared:

| Path | Source | Why |
|------|--------|-----|
| `herald/spec/lib/monotonic-clock.ts` | layout | the setup module, beside the other spec helpers in `herald/spec/lib/` |
| `herald/spec/behavior/clock-skew.spec.ts` | design | the reproduction criterion 1 asks for; `test:behavior` runs `spec/behavior` |
| `herald/vitest.config.ts` | layout | `setupFiles` names the module for the behavior, e2e, and integration runs |
| `herald/TESTING.md` | layout | records the finding beside its other consequent gotchas |
| `design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md` | design | criterion 2, `flai issue close` |
| `design/issues/summary.md` | design | `flai issue close` keeps the summary current |

`flai touches suggest` from `herald/vitest.config.ts`, `herald/spec/lib/in-memory-consequent.ts`, and `herald/TESTING.md` listed herald's routes, server, and feature specs, which changed with them in feature commits; none is touched by this fix, so none was taken. No folder touch is kept. No `after`: the story reads nothing another open story writes.

Forecast: `flai forecast` gave 9m, from 66 s per unit of size over 3 done remediation stories at size 8 (2 criteria, 6 touches). Adjusted to 1h30m: herald's test tier alone, and the close-out that runs every project's suite (I-0010), take 8 to 10 minutes a run, and the reproduction needs at least one run failing and one passing before the close-out. Delivery moved by the same 81 minutes, from flai's 2026-11-10T11:12:00Z to 2026-11-10T12:33:00Z.

Cost of delay: `flai cod` gave 25 USD a week from the operator's input, 10m lost per 168h cycle at 150 USD an hour. It stands: I-0018 has one occurrence. It understates the cost while the whole test tier runs every project, since a herald flake fails any story's run, but that is I-0010's cost, not an input to change here.
