---
id: S-0003
type: story
nature: improvement
title: Upgrade the system-flow template from 1.0.16 to current
status: done
parent: E-0001
owner: alex
created: 2026-10-21T04:58:53Z
updated: 2026-11-06T17:56:15Z
transitions:
  - to: ready
    at: 2026-10-21T04:58:53Z
    by: claude
  - to: in-progress
    at: 2026-11-06T17:47:26Z
    by: agent-S-0003
  - to: review
    at: 2026-11-06T17:53:32Z
    by: agent-S-0003
  - to: done
    at: 2026-11-06T17:56:15Z
    by: bytepunx
tags: [template, tooling]
topics: [tooling, documentation]
touches: [system-flow.yaml, system-flow.lock.yaml, CLAUDE.md, Makefile, ".gitattributes", ".github/pull_request_template.md", ".claude/settings.json", ".claude/agents/explorer.md", ".claude/agents/verifier.md", design/README.md, design/adrs/README.md, design/adrs/0000-template.md, design/analysis/README.md, design/components/README.md, design/conventions/README.md, design/conventions/code-quality.md, design/conventions/communication.md, design/conventions/continuous-improvement.md, design/conventions/decisions.md, design/conventions/delegation.md, design/conventions/design-system.md, design/conventions/documentation.md, design/conventions/git.md, design/conventions/logging.md, design/conventions/safety.md, design/conventions/session-start.md, design/conventions/strategic-agents.md, design/conventions/telemetry.md, design/conventions/tooling.md, design/conventions/work-management.md, design/digest/README.md, design/experiments/README.md, design/experiments/template.md, design/issues/summary.md, design/system/README.md, design/system/overview.md, design/tech/README.md, design/workflows/README.md, design/workflows/formulas/README.md, design/workflows/formulas/analysis-cadence.md, design/workflows/formulas/import.md, design/workflows/formulas/publish.md, design/workflows/roles/README.md, design/workflows/roles/analyzer.md, design/workflows/roles/curator.md, design/workflows/roles/orchestrator.md, design/workflows/roles/planner.md, docs/contributors/index.md, docs/operators/index.md, docs/users/index.md, scripts/README.md, scripts/check.sh, scripts/close-out.sh, scripts/fetch.sh, scripts/lint-md.sh, wip/README.md, wip/agents/README.md, wip/agents/index.md, wip/kanban/board.md, wip/messages/README.md, design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md]
after: [S-0001]
usage:
  source: log
  seconds: 378
  priced_by: harness
  turns:
    - day: 2026-11-06
      ceremony: 1
      test_runs: 3
      hand_edits: 1
      work: 48
  models:
    - model: claude-opus-5-5
      input: 128
      output: 23957
      cache_read: 6830419
      cache_write: 204389
      cost: 3.3601
  strategic:
    - kind: orchestrator
      seconds: 51
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 37
          output: 259
          cache_read: 968257
          cache_write: 141818
          cost: 1.3693
cost_of_delay:
  inputs:
    penalty_per_week: 0
    by: bytepunx
    at: 2026-11-06T17:53:07Z
  value: 0
  by: planner-S-0003
  at: 2026-11-06T17:54:02Z
forecast:
  duration: 3h
  delivery: 2026-11-06T21:00:00Z
  basis: "flai forecast's 1h is planning.default_duration with no history; raised to 3h for 60 template files, 8 hand-resolved conflicts, and the living-design fill, starting now as 2nd in pull order with in-progress room of 2."
  by: planner-S-0003
  at: 2026-11-06T17:46:57Z
---
# S-0003 Upgrade the system-flow template from 1.0.16 to current

## Goal

The repository follows the current system-flow template release, so agents work by the current conventions and `flai` features (strategic agents, experiments, messages, close-out script) are available.

## Acceptance criteria
- [x] `flai upgrade` has been applied to the newest template release and `system-flow.yaml` and the lock record it
- [x] Every conflict was resolved deliberately and the project additions below each convention marker are intact
- [x] `flai check --strict` passes and `make test` still runs
- [x] New living-design files the template adds (such as `design/system/workflow.md`) are filled for this project, not left as template text

## Tasks
- T-0021 Apply flai upgrade to 1.1.22, keeping the conflicted files for hand merging
- T-0023 Merge the 8 conflicted files with the template's 1.1.22 text by hand
- T-0024 Fill the living-design and workflow files the template adds for authstar
- T-0025 Check, lint, and test the upgraded repository and tick the criteria

## Notes

`flai upgrade --dry-run` on 2026-10-21 reported template `1.0.105` as newest, with merges for every convention file and conflicts on the files the project edited.

### Planning

Planned 2026-11-06 by planner-S-0003.

`flai upgrade --dry-run` on 2026-11-06 reports `1.0.16 -> 1.1.22`: 25 add, 14 merge, 11 replace, 8 conflict, 16 unchanged. It does not add `design/system/workflow.md`, so the fourth criterion applies to what it does add: `design/components/README.md`, `design/workflows/` (roles and formulas), `design/digest/`, `design/experiments/`, `design/analysis/`, and the conflicted `design/system/overview.md`.

Touches: the story declared none and `flai touches suggest` needs a starting path, so every touch comes from the dry run's file list (layout). It names the 60 files the upgrade adds, merges, replaces, or conflicts on, plus `system-flow.yaml` and `system-flow.lock.yaml` (from the first criterion). No folder touches: the upgrade's file list is known in full. The story's agent later declared one more touch, the issue file `design/issues/I-0004-...` it recorded (declared), and it is kept.

`after`: S-0001 (done) is kept as declared. It wrote the scaffolding and lock at 1.0.16 that this story upgrades from.

S-0002's work is on `origin/story/S-0002` and not on `main`, though S-0002 is accepted. T-0021 applied the upgrade first, so `Makefile`, `scripts/README.md`, and `scripts/check.sh` were replaced as unedited. When S-0002 merges, `Makefile` and `scripts/README.md` conflict, and S-0002's side is additive (TH-0005).

Forecast: `flai forecast` gave 1h, the project's `planning.default_duration`, because no done story had usage yet. Raised to 3h for one upgrade run, 8 conflicts merged by hand against the template, the living-design and role files to read and fill, and then `flai check --strict`, the markdown lint, and `make test`. Delivery was 3h from the start, as 2nd in the pull order with an in-progress limit of 2.

Cost of delay: 0 USD a week. The operator gave `penalty_per_week` 0 on 2026-11-06 (TH-0006), and `flai cod S-0003` gives 0.00 USD a week from it. The value is written as given, with no adjustment, because no other input exists.

### Verification

Observed on 2026-11-06 on `story/S-0003` at `ac1be82`:

- Criterion 1: `system-flow.yaml` and `system-flow.lock.yaml` record `ref: "v1.1.22"`, `version: "1.1.22"`. `flai upgrade --dry-run` named 1.1.22 as the newest release.
- Criterion 2: the text below `<!-- system-flow:end-of-baseline -->` in every convention file, and the project's lines in `CLAUDE.md`, are byte-identical to before the upgrade. Of the 8 conflicts, the template changed only `design/README.md`, `design/adrs/README.md`, and `design/system/overview.md` between 1.0.16 and 1.1.22. The first two were merged by hand (T-0023). The overview already carried `topics: [all]`. The other five keep the project's content.
- Criterion 3: `flai verify S-0003` passed every step, `flai check --strict` included. `make test` exits 0, but it runs only the template stub `scripts/test.sh`, because S-0002's component test scripts are on `origin/story/S-0002` and not on `main`. The markdown lint reports 0 issues in the 45 changed markdown files.
- Criterion 4: template 1.1.22 adds no `design/system/workflow.md`. The files it does add (`design/components/`, `design/analysis/`, `design/digest/`, `design/experiments/`, and `design/workflows/` with its roles and formulas) were each read. They hold folder rules and runtime prompt templates, with nothing project-specific left to fill. `design/system/README.md` already names authstar and lists `overview.md`.
