---
id: S-0026
type: story
nature: remediation
title: keep's usage-updated event still carries the retired tenant scope
status: backlog
owner: bytepunx
created: 2026-11-13T12:08:12Z
updated: 2026-11-15T19:37:32Z
transitions: []
tags: [keep]
touches: [design/adrs/0113-keep-s-usage-updated-event-is-scoped-to-the-reporting-account.md, design/adrs/README.md, keep/src/routes/usage.ts, keep/src/actors/usage_record_actor.ts, keep/src/lib/entitlement-publisher.ts, keep/src/lib/consequent-sequence-provider.ts, keep/spec/behavior/usage.spec.ts, keep/spec/behavior/consequent-sequence-provider.spec.ts, keep/src/routes/billing-reads.ts, keep/spec/behavior/billing-reads.spec.ts, keep/TESTING.md, design/stories/keep/001-actor-definitions.md, design/stories/keep/005-usage-records-and-credentials.md, design/issues/I-0021-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md, design/issues/summary.md]
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
    - kind: planner
      seconds: 8
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 17
          output: 919
          cache_read: 952657
          cache_write: 16070
          cost: 0.381
    - kind: orchestrator
      seconds: 34
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 11
          output: 74
          cache_read: 352891
          cache_write: 41155
          cost: 0.4528
cost_of_delay:
  inputs:
    time_lost_per_cycle: 15m
    by: flai
    at: 2026-11-13T12:08:12Z
  value: 37.5
  by: planner-S-0026
  at: 2026-11-14T10:10:00Z
forecast:
  duration: 1h
  delivery: 2026-11-30T21:46:00Z
  basis: "Its own forecast of 1h; 5th in the pull order with an in-progress limit of 4, behind S-0014, S-0022, S-0012, S-0007, S-0008 and S-0010."
  by: flai
  at: 2026-11-15T19:37:32Z
finalized:
  by: bytepunx
  at: 2026-11-14T10:15:18Z
---
# S-0026 keep's usage-updated event still carries the retired tenant scope

## Goal

This story remediates [I-0021](../../../design/issues/I-0021-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md), "keep's usage-updated event still carries the retired tenant scope". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0021 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0021 is closed with `flai issue close I-0021 --reason` saying what fixed it

## Tasks
- T-0146 An ADR scopes keep's usage-updated event to the reporting account and retires the tenant customer read
- T-0147 Keep publishes usage-updated scoped to the reporting account with that account's running total
- T-0148 Keep drops the tenant-scoped customer read and its specs seed account and organization records only
- T-0149 Close I-0021 with the reason that keep no longer publishes or reads the tenant scope

## Notes

Cost of delay inputs set by flai from I-0021. time_lost_per_cycle 15m: 15m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-10T03:45:55Z, 3.3 days before this story; under one cycle counts as one).

### Planning

The story declared no touches, so `flai touches suggest` needed paths to start from. They came from I-0021's instance. Every touch is a file. No folder touch is kept, and nothing is named in `after`.

| Touch | Source |
|-------|--------|
| `keep/src/routes/usage.ts`, `keep/src/lib/entitlement-publisher.ts`, `keep/src/routes/billing-reads.ts`, `keep/spec/behavior/billing-reads.spec.ts` | declared in I-0021's instance |
| `keep/spec/behavior/usage.spec.ts`, `keep/spec/behavior/consequent-sequence-provider.spec.ts`, `keep/TESTING.md` | co-change: `flai touches suggest` on the three source files |
| `keep/src/actors/usage_record_actor.ts`, `keep/src/lib/consequent-sequence-provider.ts` | layout: the actor's `searchableBy` lacks `accountId`, and the provider imports `UsageScope` |
| `design/adrs/0113-keep-s-usage-updated-event-is-scoped-to-the-reporting-account.md`, `design/adrs/README.md` | design: the goal asks for a proposed fix. The number is a guess, since ADR-0110 and ADR-0112 sit on open branches |
| `design/stories/keep/001-actor-definitions.md`, `design/stories/keep/005-usage-records-and-credentials.md` | design: both still show `{tenant}` in the usage-updated and customer shapes |
| `design/issues/I-0021-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md`, `design/issues/summary.md` | criterion 2 |

Tower has no consumer for `entitlement.usage-updated` today, so tower is not touched. `keep/src/report-tenant-scope.ts` and the `{tenant}` refusal specs stay, as ADR-0109 requires.

Forecast: `flai forecast` gave 23m (79 s per unit of size over 5 done remediation stories, size 17). I raised it to 1h. The story holds an ADR, two code tasks with specs, and an issue close. Its close-out runs keep's tiers and a kluster deploy and checks, and S-0006's close-out alone took 6m55s. I moved the delivery 37m later than flai's 2026-11-16T22:50Z to match.

Cost of delay: 37.50 USD a week, as `flai cod` worked it out from flai's input of 15m lost per 168h cycle at 150 USD an hour. It stands. One occurrence, and no consumer reads the event yet, so nothing argues for raising it.
