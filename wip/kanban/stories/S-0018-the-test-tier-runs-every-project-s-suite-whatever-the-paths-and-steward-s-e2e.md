---
id: S-0018
type: story
nature: improvement
title: The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees
status: backlog
owner: bytepunx
created: 2026-11-06T21:11:49Z
updated: 2026-11-13T12:08:13Z
transitions: []
tags: [testing, scripts, steward]
topics: [testing]
touches: [scripts/test.sh, scripts/lib-projects.sh, scripts/README.md, system-flow.yaml, steward/playwright.config.ts, steward/tests/e2e/run-fake-backend.ts, steward/tests/helpers/steward-server.ts, steward/TESTING.md, docs/contributors/index.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
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
      seconds: 62
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 28
          output: 203
          cache_read: 964976
          cache_write: 141563
          cost: 1.2582
cost_of_delay:
  inputs:
    time_lost_per_cycle: 15m
    by: flai
    at: 2026-11-06T21:11:49Z
  value: 37.5
  by: planner-S-0018
  at: 2026-11-09T22:10:33Z
forecast:
  duration: 3h
  delivery: 2026-11-14T02:42:00Z
  basis: "Its own forecast of 3h; 6th in the pull order with an in-progress limit of 4, behind S-0007, S-0008, S-0010, S-0013, S-0025, S-0012, S-0014, S-0015, S-0016 and S-0017."
  by: flai
  at: 2026-11-13T12:08:13Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:47:20Z
---
# S-0018 The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees

## Goal

This story remediates [I-0010](../../../design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md), "The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0010 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0010 is closed with `flai issue close I-0010 --reason` saying what fixed it

## Tasks
- T-0120 scripts/test.sh runs only the projects it is given, and every project with none
- T-0122 Steward's e2e picks free ports for the fake tower and steward on every run
- T-0124 Declare one test tier per project in system-flow.yaml, selected by its folder
- T-0125 Document per-project tiers, reproduce I-0010's instance, and close I-0010

## Notes

Cost of delay inputs set by flai from I-0010. time_lost_per_cycle 15m: 15m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-06T18:29:23Z, 0.1 days before this story; under one cycle counts as one).

### Planning

The proposed fix has two parts, one for each cause in I-0010's instance.

- Tier selection. `system-flow.yaml` declares no `tests`, so `flai test` and the close-out run `scripts/test.sh` as their one tier, and it runs every npm project and portcullis. The plan gives `scripts/test.sh` project arguments, keeping no argument as every project for `make test` and CI. It then declares one tier per project under `tests` in `system-flow.yaml`, each selected by its project's folder and running `scripts/test.sh <project>`. This edits a manifest key beyond `name`, `description`, and `dashboard`, which CLAUDE.md leaves to flai, so the plan's thread asks the operator to allow it.
- Steward's e2e ports. `steward/playwright.config.ts` pins the fake tower to 4610 and steward to 4611 with `reuseExistingServer`, and `steward/tests/e2e/run-fake-backend.ts` pins 4610 again. The plan picks free ports once in Playwright's main process and hands them to its workers and both web servers through the environment. It reuses `getFreePort` from `steward/tests/helpers/steward-server.ts` and drops `reuseExistingServer`.

Where each touch came from:

| Touch | Source |
|-------|--------|
| `scripts/test.sh`, `scripts/lib-projects.sh` | design: I-0010's instance names `scripts/test.sh`; the project lists live in `lib-projects.sh` |
| `system-flow.yaml` | design: the manifest's `tests` list is what `flai test` selects tiers from |
| `steward/playwright.config.ts`, `steward/tests/e2e/run-fake-backend.ts` | design: I-0010's instance names the config; the fake backend pins 4610 too |
| `steward/tests/helpers/steward-server.ts` | layout: it holds `getFreePort`, which the e2e config can share |
| `steward/TESTING.md` | layout: it documents the e2e tier's fixed port |
| `scripts/README.md`, `docs/contributors/index.md` | co-change: `flai touches suggest` lists both, at 38% and 50%, and both describe `make test` and `scripts/test.sh` |
| `design/issues/I-0010-…md`, `design/issues/summary.md` | design: criterion 2 closes I-0010 with `flai issue close` |

`flai touches suggest` also listed `Makefile` and the template's convention files. They were left out: `make test` keeps running every project, and the conventions are the template upgrade's co-changes, not this story's.

Web's Playwright config pins its ports too, but no tier runs web's e2e yet. S-0022 adds that tier, so web's ports are left to it. S-0018 names no story in `after`: it reads no other story's output. S-0019, in progress, touches `system-flow.yaml` and `scripts/README.md` too; a trial merge judges that overlap.

Figures:

- Forecast: 3h, delivery 2026-11-10T12:00:00Z, adjusted from flai's 14m and 09:30. flai worked the 14m out from size 13 (2 criteria, 11 touches) at a median of 61 s per unit over 4 done stories. That rate cannot cover four tasks across a shell script, the manifest, a Playwright config, and docs. Proving the fix also means running steward's e2e and a full `make test`, which took 9m11s in I-0010's instance. The delivery moves later by the same difference.
- Cost of delay: 37.50 USD a week, as `flai cod` works it out from the operator's input: 15m lost per 168h cycle at 150 USD an hour. The input counts one occurrence. Every `flai test` and close-out runs the whole suite until this story lands, so the real time lost is likely higher. Raising the input is the operator's call.
