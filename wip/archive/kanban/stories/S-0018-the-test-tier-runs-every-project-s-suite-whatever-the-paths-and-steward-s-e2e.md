---
id: S-0018
type: story
nature: improvement
title: The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees
status: done
owner: bytepunx
created: 2026-11-06T21:11:49Z
updated: 2026-11-15T07:19:35Z
transitions:
  - to: ready
    at: 2026-11-14T10:09:19Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-15T05:53:32Z
    by: agent-S-0018
  - to: review
    at: 2026-11-15T06:19:12Z
    by: agent-S-0018
  - to: in-progress
    at: 2026-11-15T06:22:10Z
    by: flai
  - to: review
    at: 2026-11-15T06:25:51Z
    by: agent-S-0018
  - to: in-progress
    at: 2026-11-15T07:10:57Z
    by: flai
  - to: review
    at: 2026-11-15T07:14:17Z
    by: agent-S-0018
  - to: done
    at: 2026-11-15T07:19:35Z
    by: bytepunx
tags: [testing, scripts, steward]
topics: [testing]
touches: [scripts/test.sh, scripts/README.md, system-flow.yaml, steward/playwright.config.ts, steward/tests/e2e/run-fake-backend.ts, steward/TESTING.md, docs/contributors/index.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/I-0038-golden-path-step-4b-keep-answers-403-on-authstar-me-subscription-through.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 1981
  priced_by: harness
  turns:
    - day: 2026-11-15
      ceremony: 4
      hand_edits: 2
      work: 106
  models:
    - model: claude-opus-5-5
      input: 266
      output: 42709
      cache_read: 29054959
      cache_write: 336232
      cost: 9.284
  strategic:
    - kind: orchestrator
      seconds: 225
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 105
          output: 694
          cache_read: 3303037
          cache_write: 475650
          cost: 4.2071
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
  delivery: 2026-11-30T23:58:00Z
  basis: "Its own forecast of 3h; 5th in the pull order with an in-progress limit of 4, behind S-0014, S-0021, S-0022, S-0012, S-0007, S-0008 and S-0010."
  by: flai
  at: 2026-11-15T05:53:17Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:47:20Z
---
# S-0018 The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees

## Goal

This story remediates [I-0010](../../../design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md), "The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [x] The cause I-0010 describes no longer occurs, with a test that reproduces it where one fits
- [x] I-0010 is closed with `flai issue close I-0010 --reason` saying what fixed it

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

### Verification

- Criterion 1 was verified locally. `flai test chronicle/src/server.ts` ran the chronicle tier alone in 6.3s, and `flai test steward/playwright.config.ts` ran the steward tier alone in 28.1s and passed. During both runs, 4610 was held by a decoy server and 4611 by S-0023's live steward server (T-0125's Notes). The close-out at 3babcf4 ran the ten per-project tiers in about 2.5 minutes, against the 9 minutes the single tier took.
- Criterion 2: I-0010 is closed in 92b34bc, with a reason naming T-0120, T-0122, and T-0124.
- Kluster: S-0018 was not deployed. All namespaces are held (by S-0014, S-0021, S-0022, and S-0023, over `kluster.agent_namespaces` of 2). Neither criterion needs a running system, because S-0018 changes only the test scripts, the manifest's tiers, and steward's Playwright config, none of which is built into an image.
- 2026-11-15T06:22:10Z: moved to in-progress: flai serve's checks of S-0018 against its kluster namespace ended failed, at the check golden-path, at commit 3babcf408744
- 2026-11-15T07:10:57Z: moved to in-progress: bytepunx asked its agent to rebase story/S-0018 onto main and resolve what holds its acceptance, 1 blocker: S-0018's verify does not cover the main branch it would land on: its last flai verify, at 3804bfe, ran over main at 2bfe5ec, and the 18 paths main brought in si...; its agent syncs it with flai stream sync S-0018, takes each blocker's recommended action, closes out again, and moves it to review
