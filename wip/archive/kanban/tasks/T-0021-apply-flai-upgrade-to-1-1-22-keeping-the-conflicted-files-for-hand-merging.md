---
id: T-0021
type: task
nature: improvement
title: Apply flai upgrade to 1.1.22, keeping the conflicted files for hand merging
status: done
parent: S-0003
owner: bytepunx
created: 2026-11-06T17:47:29Z
updated: 2026-11-06T17:48:50Z
transitions:
  - to: ready
    at: 2026-11-06T17:48:07Z
    by: agent-S-0003
  - to: in-progress
    at: 2026-11-06T17:48:07Z
    by: agent-S-0003
  - to: done
    at: 2026-11-06T17:48:50Z
    by: agent-S-0003
stream: S-0003
tags: [template, tooling]
touches: [system-flow.yaml, system-flow.lock.yaml, CLAUDE.md, Makefile, ".gitattributes", ".github/pull_request_template.md", ".claude/settings.json", ".claude/agents/explorer.md", ".claude/agents/verifier.md", design/adrs/0000-template.md, design/analysis/README.md, design/components/README.md, design/conventions/README.md, design/conventions/code-quality.md, design/conventions/communication.md, design/conventions/continuous-improvement.md, design/conventions/decisions.md, design/conventions/delegation.md, design/conventions/design-system.md, design/conventions/documentation.md, design/conventions/git.md, design/conventions/logging.md, design/conventions/safety.md, design/conventions/session-start.md, design/conventions/strategic-agents.md, design/conventions/telemetry.md, design/conventions/tooling.md, design/conventions/work-management.md, design/digest/README.md, design/experiments/README.md, design/experiments/template.md, design/system/README.md, design/workflows/README.md, design/workflows/formulas/README.md, design/workflows/formulas/analysis-cadence.md, design/workflows/formulas/import.md, design/workflows/formulas/publish.md, design/workflows/roles/README.md, design/workflows/roles/analyzer.md, design/workflows/roles/curator.md, design/workflows/roles/orchestrator.md, design/workflows/roles/planner.md, docs/operators/index.md, docs/users/index.md, scripts/README.md, scripts/check.sh, scripts/close-out.sh, scripts/fetch.sh, scripts/lint-md.sh, wip/README.md, wip/agents/README.md, wip/messages/README.md]
usage:
  source: log
  seconds: 43
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 16
      output: 3027
      cache_read: 862919
      cache_write: 25821
      cost: 0.4245
---
# T-0021 Apply flai upgrade to 1.1.22, keeping the conflicted files for hand merging

## Work

Run `flai upgrade --dry-run` again and compare it with the 2026-11-06 result in the story's `### Planning`: `1.0.16 -> 1.1.22`, with 25 adds, 14 merges, 11 replaces, and 8 conflicts. If a newer release or a different file list appears, record it in the narrative and continue with what the dry run shows now.

Before applying, check whether S-0002's branch, `origin/story/S-0002`, has reached `main`. If it has, `Makefile`, `scripts/README.md`, and `scripts/check.sh` are conflicts rather than replaces. Keep S-0002's `make install`, `test`, `integration`, and `smoke` targets and its scripts, and record that in the narrative.

Run `flai upgrade --keep-all` on a clean tree. Without a terminal, the 8 conflicted files stay as the project has them, and the next task merges them by hand. Every add, merge, and replace lands now.

Read every merged convention file and `CLAUDE.md`. Check that the text below `<!-- system-flow:end-of-baseline -->` is what it was before the upgrade.

## Done when

- `system-flow.yaml` `template.ref` and `template.version`, and `system-flow.lock.yaml`, name the release applied.
- Every file the dry run listed as add, merge, or replace matches the template at that release.
- The text below the marker in every convention file and in `CLAUDE.md` is unchanged, checked with `git diff` and recorded in the narrative.
- The 8 conflicted files are listed in the narrative for the next task.

## Notes

`flai upgrade` without a terminal needs `--keep-all` or `--replace-all`. `--keep-all` never overwrites the project's edits, and the conflicts are resolved in the next task.
