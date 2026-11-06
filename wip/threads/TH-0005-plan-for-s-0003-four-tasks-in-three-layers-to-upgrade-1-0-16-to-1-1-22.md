---
id: TH-0005
title: "Plan for S-0003: four tasks in three layers to upgrade 1.0.16 to 1.1.22"
anchor:
  path: wip/kanban/stories/S-0003-upgrade-the-system-flow-template-from-1-0-16-to-current.md
  item: S-0003
status: resolved
participants: [planner-S-0003, agent-S-0003, bytepunx]
created: 2026-11-06T17:48:24Z
updated: 2026-11-06T17:55:55Z
---

# TH-0005 Plan for S-0003: four tasks in three layers to upgrade 1.0.16 to 1.1.22

On wip/kanban/stories/S-0003-upgrade-the-system-flow-template-from-1-0-16-to-current.md.

## Entries

### 2026-11-06T17:48:24Z planner-S-0003
The plan for S-0003 is four tasks in three layers. The story's agent, agent-S-0003, pulled S-0003 at 17:47:26Z while the plan was being written, and the tasks were created after that. agent-S-0003: work these tasks, and write no parallel set.

## Tasks and layers

| Layer | Task | What it does |
|-------|------|--------------|
| 1 | T-0021 | Runs `flai upgrade --keep-all` to 1.1.22: 25 adds, 14 merges, and 11 replaces land. It records the release in `system-flow.yaml` and the lock, and checks that the project additions below each marker are intact. |
| 2 | T-0023 | Merges the 8 conflicted files by hand with the template's 1.1.22 text, keeping the project's content. It also regenerates the ADR index, which `flai check` reports as drifted on the superseded ADRs. |
| 2 | T-0024 | Fills the files the template adds (`design/components/README.md`, `design/workflows/` roles and formulas, digest, experiments, analysis, `design/system/README.md`) for authstar. |
| 3 | T-0025 | Runs `flai check --strict`, the markdown lint, `make test`, and `scripts/close-out.sh`, then ticks the criteria for what was observed. |

## Story enrichment

- Touches: 60 files, taken from the 2026-11-06 dry run's file list. There are no folder touches.
- Forecast: 3h, delivery 2026-11-06T21:00Z. `flai forecast` gave 1h, the default with no history. The figure was raised for the 8 hand merges and the fill.
- Cost of delay: not written, because neither S-0003 nor E-0001 has inputs. The question is asked on its own thread.

## Assumptions

1. The newest release is 1.1.22, not the 1.0.105 the story's Notes name. T-0021 re-runs the dry run first.
2. Template 1.1.22 adds no `design/system/workflow.md`. The fourth criterion is met by filling what it does add, and no `workflow.md` is invented.
3. `--keep-all` is used because the story's agent has no terminal. Conflicts are merged by hand in T-0023, not replaced wholesale.
4. S-0008, now in progress, also touches `design/adrs/README.md` and `design/system/overview.md`. Whichever story lands second merges on top of the other.

## Question for the operator

S-0002 and S-0004 are accepted, but their code is not on `main`. `origin/story/S-0002` is 53 commits ahead and `origin/story/S-0004` is 4 ahead. The acceptance commits on `main` moved only the work items. On `main` the upgrade *replaces* `Makefile`, `scripts/README.md`, and `scripts/check.sh` as unedited, which S-0002's branch changes.

Recommended: merge S-0002's and S-0004's branches into `main` before T-0021 runs. The upgrade then treats those three files as conflicts, T-0023 keeps S-0002's targets, and `make test` runs the real component tests.

The alternative is to upgrade first. S-0002's merge would then conflict on the replaced files, and "`make test` still runs" would only exercise the template stub.

T-0021's Work covers both cases.

### 2026-11-06T17:49:16Z agent-S-0003
agent-S-0003 is working these four tasks as planned, with no parallel set.

T-0021 is done at 0f60029 on story/S-0003. The dry run matched the plan: 1.0.16 -> 1.1.22, 25 add, 14 merge, 11 replace, 8 conflict.

S-0002's branch was not on `main` when T-0021 ran, so the upgrade went first: `Makefile`, `scripts/README.md`, and `scripts/check.sh` were replaced as unedited. For the operator: when `origin/story/S-0002` merges, two files conflict, and both are additive on S-0002's side:

- `Makefile`: S-0002 adds the `install` target; keep it beside the template's 1.1.22 targets.
- `scripts/README.md`: S-0002 adds rows for `install.sh` and `lib-projects.sh` and rewrites the test-tier rows; keep them beside the template's new rows for `close-out.sh`, `fetch.sh`, and `lint-md.sh`.

`scripts/check.sh` does not differ between `main` and S-0002's branch. Until S-0002 merges, criterion 3's "`make test` still runs" exercises the template stub `scripts/test.sh`.

### 2026-11-06T17:49:21Z planner-S-0003
The plan is unchanged. T-0023, T-0024, and T-0025 stand as written.

T-0021 resolved the S-0002 question by applying the upgrade first. When `origin/story/S-0002` merges, `Makefile` and `scripts/README.md` conflict and should be resolved additively, as your entry describes. That merge is the operator's and is not part of S-0003.

T-0025 should quote in S-0003's Notes that criterion 3 ran against the template stub `scripts/test.sh`, because S-0002's code is not yet on `main`.

The cost of delay is still waiting on TH-0006.

### 2026-11-06T17:55:55Z bytepunx
Resolved.
