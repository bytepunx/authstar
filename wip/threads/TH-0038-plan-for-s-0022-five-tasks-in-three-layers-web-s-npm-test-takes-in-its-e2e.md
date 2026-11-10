---
id: TH-0038
title: "Plan for S-0022: five tasks in three layers; web's npm test takes in its e2e"
anchor:
  path: wip/kanban/stories/S-0022-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md
  item: S-0022
status: open
participants: [planner-S-0022]
created: 2026-11-09T22:11:25Z
updated: 2026-11-09T22:11:25Z
---

# TH-0038 Plan for S-0022: five tasks in three layers; web's npm test takes in its e2e

On wip/kanban/stories/S-0022-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md.

## Entries

### 2026-11-09T22:11:25Z planner-S-0022
Proposed fix: web's `npm test` runs `test:e2e`, as every other project's `npm test` runs its e2e (D-0011, D-0030). The manifest declares no `tests`, so `flai test` and the close-out run `scripts/test.sh`, which runs each project's `npm test`. With this change both run web/e2e. No manifest tier is added: selecting projects by path is S-0018's (I-0010), and this fix holds whatever S-0018 does.

Tasks and layers:

| Layer | Task | After | Touches |
|-------|------|-------|---------|
| 1 | T-0115 Web's e2e picks free ports and never reuses a running server | none | `web/playwright.config.ts`, `web/e2e/fixtures/urls.ts` |
| 1 | T-0116 `scripts/check-e2e-tiers.sh` fails when a project's `npm test` leaves out its `test:e2e`; `scripts/test.sh` runs it first | none | `scripts/check-e2e-tiers.sh`, `scripts/test.sh`, `scripts/README.md` |
| 1 | T-0117 Chromium installed by `make install` and in CI for steward and web | none | `scripts/lib-projects.sh`, `scripts/install.sh`, `.github/workflows/ci.yml` |
| 2 | T-0118 Web's `npm test` runs `test:e2e`; `web/TESTING.md` says so | T-0115, T-0116 | `web/package.json`, `web/TESTING.md` |
| 3 | T-0119 Run `flai test --all` with web's e2e in it; close I-0017 | T-0117, T-0118 | I-0017, `design/issues/summary.md` |

Figures:

- Forecast: 2h, delivery 2026-11-10T12:00Z. flai's 16m is raised because each full test-tier run takes 8 to 10 minutes (D-0031), and web's e2e adds a cold build.
- Cost of delay: 25 USD a week, from the 10m-per-cycle input, unchanged.

Assumptions:

- T-0116 is the criterion's reproducing test: it fails on web today and passes once T-0118 lands.
- T-0115 goes beyond I-0017 on purpose. Without it, putting web's e2e in the shared tier would bring I-0010's fixed-port hazard to web, and a run could pass against another worktree's build. Steward's ports stay S-0018's.
- T-0117 has `make install` download chromium onto the host (`npx playwright install chromium`). Today nothing installs it; steward's TESTING.md asks for it by hand.
- Until S-0018 lands, every run of the test tier pays for web's e2e, a few minutes more.
- No `after` on S-0018: S-0022 reads nothing S-0018 writes. Both change `scripts/test.sh`, and a trial merge judges that. So does `scripts/install.sh` with S-0021.

Nothing here needs your answer unless you would rather not have T-0115 or T-0117 in this story.
