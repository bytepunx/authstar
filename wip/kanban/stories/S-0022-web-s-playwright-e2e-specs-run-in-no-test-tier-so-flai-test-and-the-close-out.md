---
id: S-0022
type: story
nature: remediation
title: Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e
status: backlog
owner: bytepunx
created: 2026-11-09T09:04:34Z
updated: 2026-11-14T08:26:33Z
transitions: []
tags: [web]
topics: [testing]
touches: [web/package.json, web/playwright.config.ts, web/e2e/fixtures/urls.ts, web/TESTING.md, scripts/check-e2e-tiers.sh, scripts/test.sh, scripts/README.md, scripts/lib-projects.sh, scripts/install.sh, ".github/workflows/ci.yml", design/issues/I-0017-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md, design/issues/summary.md]
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
          input: 10
          output: 75
          cache_read: 340125
          cache_write: 57070
          cost: 0.4537
cost_of_delay:
  inputs:
    time_lost_per_cycle: 10m
    by: flai
    at: 2026-11-09T09:04:34Z
  value: 25
  by: planner-S-0022
  at: 2026-11-09T22:10:58Z
forecast:
  duration: 2h
  delivery: 2026-11-15T06:30:00Z
  basis: "Its own forecast of 2h; 10th in the pull order with an in-progress limit of 4, behind S-0006, S-0013, S-0017, S-0012, S-0007, S-0008, S-0010, S-0014, S-0015, S-0016, S-0018 and S-0021."
  by: flai
  at: 2026-11-14T08:26:33Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:47:41Z
---
# S-0022 Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e

## Goal

This story remediates [I-0017](../../../design/issues/I-0017-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md), "Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0017 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0017 is closed with `flai issue close I-0017 --reason` saying what fixed it

## Tasks
- T-0115 Give web's Playwright e2e free ports per run and never reuse a running server
- T-0116 Add scripts/check-e2e-tiers.sh, which fails when a project's npm test leaves out its test:e2e, and run it from scripts/test.sh
- T-0117 Install Playwright's chromium in make install and in CI for steward and web
- T-0118 Make web's npm test run its Playwright e2e, as steward's does
- T-0119 Run the whole test tier with web's e2e in it, and close I-0017

## Notes

Cost of delay inputs set by flai from I-0017. time_lost_per_cycle 10m: 10m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-09T07:17:15Z, 0.1 days before this story; under one cycle counts as one).

### Planning

Proposed fix: web's `npm test` runs `test:e2e`, as every other project's `npm test` runs its e2e (D-0011, D-0030). The fix does not add a test tier to the manifest. The manifest declares no `tests`, so `flai test` and the close-out run `scripts/test.sh`, which runs each project's `npm test`. Selecting projects by path is S-0018's (I-0010), and this fix holds whatever S-0018 does there. Three changes come with it:

- web's e2e picks free ports and never reuses a running server, so the tier cannot test another worktree's build (T-0115);
- `scripts/check-e2e-tiers.sh` reproduces the cause and guards against it (T-0116);
- chromium is installed by `make install` and in CI (T-0117).

Touches, and where each came from:

| Touch | Source |
|-------|--------|
| `web/package.json` | design: the `test` script I-0017 names |
| `web/TESTING.md` | layout: web's tier documentation |
| `web/playwright.config.ts`, `web/e2e/fixtures/urls.ts` | layout: where web's e2e ports are fixed |
| `scripts/check-e2e-tiers.sh` | layout: the new reproducing check |
| `scripts/test.sh` | design: the tier I-0017 names; runs the check |
| `scripts/README.md` | layout: the scripts index |
| `scripts/lib-projects.sh`, `scripts/install.sh` | layout: where `make install` gets its project lists |
| `.github/workflows/ci.yml` | layout: CI runs `npm test` per project |
| `design/issues/I-0017-…md`, `design/issues/summary.md` | design: criterion 2's `flai issue close` |

From `flai touches suggest`, `web/package-lock.json`, `web/spec/fixtures/fake-tower-server.ts`, and `Makefile` were left out. No dependency changes, and the fake server already reads `PORT`. The rest were template-upgrade co-changes. No folder touch. No `after`: the story reads nothing another open story writes.

Forecast: `flai forecast` gave 16m (66s median × size 14). Raised to 2h, because the close-out alone runs the whole test tier, about 8 to 10 minutes (D-0031), and web's e2e adds a cold `build` and `build:widgets` on each run. T-0115 also needs two concurrent e2e runs. The delivery moves with the duration, 10th in the pull order.

Cost of delay: `flai cod` gives 25 USD a week from the operator's input, 10m lost per 168h cycle at 150 USD an hour. Kept as given.
