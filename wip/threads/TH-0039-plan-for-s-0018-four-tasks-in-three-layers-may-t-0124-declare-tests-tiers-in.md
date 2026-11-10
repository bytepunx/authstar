---
id: TH-0039
title: "Plan for S-0018: four tasks in three layers; may T-0124 declare tests tiers in system-flow.yaml?"
anchor:
  path: wip/kanban/stories/S-0018-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md
  item: S-0018
status: open
participants: [planner-S-0018]
created: 2026-11-09T22:11:40Z
updated: 2026-11-09T22:48:22Z
---

# TH-0039 Plan for S-0018: four tasks in three layers; may T-0124 declare tests tiers in system-flow.yaml?

On wip/kanban/stories/S-0018-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md.

## Entries

### 2026-11-09T22:11:40Z planner-S-0018
May S-0018 declare a `tests` list in `system-flow.yaml`? CLAUDE.md leaves every manifest key but `name`, `description`, and `dashboard` to flai, and T-0124 needs one.

Recommended: yes. Add one tier per project, each selected by its folder and running `scripts/test.sh <project>`. Add no integration or smoke tier. Without per-project tiers, `flai test` and the close-out keep running `scripts/test.sh` as one tier for any path. That is I-0010's first cause.

Alternative: no manifest change. `scripts/test.sh` would pick projects itself from the files the branch changed against main. This is less exact: `flai test <path>` would not pass its paths to the script.

T-0120 and T-0122 do not wait on this answer. Only T-0124 does.

The plan, four tasks in three layers:

| Layer | Task | after | touches |
|-------|------|-------|---------|
| 1 | T-0120 `scripts/test.sh` runs only the projects it is given, and every project with none | none | `scripts/test.sh`, `scripts/lib-projects.sh`, `scripts/README.md` |
| 1 | T-0122 Steward's e2e picks free ports for the fake tower and steward on every run | none | `steward/playwright.config.ts`, `steward/tests/e2e/run-fake-backend.ts`, `steward/tests/helpers/steward-server.ts`, `steward/TESTING.md` |
| 2 | T-0124 Declare one test tier per project in `system-flow.yaml` | T-0120 | `system-flow.yaml` |
| 3 | T-0125 Document per-project tiers, reproduce I-0010's instance, and close I-0010 | T-0122, T-0124 | `docs/contributors/index.md`, I-0010, `design/issues/summary.md` |

Figures:

- Forecast: 3h, delivery 2026-11-10T12:00:00Z. flai said 14m, from 61 s per unit of size; that is too low for four tasks and a steward e2e run.
- Cost of delay: 37.50 USD a week, from your input of 15m lost per cycle. That input counts one occurrence. Every `flai test` and close-out runs the whole suite until this lands, so you may want to raise it.

Assumptions:

- `make test` and CI keep running every project. Only `flai test` and the close-out select by path.
- Web's Playwright config pins its ports too, but no tier runs web's e2e yet. That fix is left to S-0022, which adds web's e2e tier.
- S-0018 has no `after`. S-0019, in progress, also touches `system-flow.yaml` and `scripts/README.md`; a trial merge judges that overlap.
- No thread named "asked" exists, and S-0018 had no earlier plan, so this plan starts from scratch.

### 2026-11-09T22:48:22Z planner-S-0018
Replanned S-0018 at the orchestrator's request: no change to the plan.

Since the last plan, the operator's only change was to finalize S-0018 (draft false). Nobody has written on this thread, so nothing asked for a change.

What I checked:

- `flai touches suggest`, `flai forecast`, and `flai cod` give the same results as before: 14m (adjusted to 3h for the reasons in the Notes) and 37.50 USD a week. The touches and figures stand.
- T-0120, T-0122, T-0124, and T-0125 still deliver the outcome. Their touches and `after` are unchanged. The layers are still T-0120 and T-0122, then T-0124, then T-0125. No task to split, merge, add, or drop.
- S-0019 is now in review. It adds a `kluster:` block to `system-flow.yaml` and changes files under `scripts/`. T-0124's `tests` list is a separate key, so a trial merge should find it clean.

Still open: may T-0124 declare `tests` tiers in `system-flow.yaml`? I still recommend yes. T-0124 tells the story's agent to wait for this answer. T-0120 and T-0122 do not need it.
