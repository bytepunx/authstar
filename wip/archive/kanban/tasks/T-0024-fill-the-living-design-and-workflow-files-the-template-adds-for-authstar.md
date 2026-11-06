---
id: T-0024
type: task
nature: improvement
title: Fill the living-design and workflow files the template adds for authstar
status: done
parent: S-0003
owner: bytepunx
created: 2026-11-06T17:47:46Z
updated: 2026-11-06T17:51:51Z
transitions:
  - to: ready
    at: 2026-11-06T17:49:19Z
    by: agent-S-0003
  - to: in-progress
    at: 2026-11-06T17:49:19Z
    by: agent-S-0003
  - to: done
    at: 2026-11-06T17:51:51Z
    by: agent-S-0003
stream: S-0003
tags: [template, documentation]
touches: [design/components/README.md, design/analysis/README.md, design/digest/README.md, design/experiments/README.md, design/workflows/README.md, design/workflows/roles/README.md, design/workflows/roles/planner.md, design/workflows/roles/orchestrator.md, design/workflows/roles/analyzer.md, design/workflows/roles/curator.md, design/workflows/formulas/README.md, design/system/README.md]
after: [T-0021]
usage:
  source: log
  seconds: 152
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 23
      output: 4270
      cache_read: 1217298
      cache_write: 36426
      cost: 0.5988
---
# T-0024 Fill the living-design and workflow files the template adds for authstar

## Work

Read each living-design and workflow file the upgrade added. These are `design/components/README.md`, `design/analysis/README.md`, `design/digest/README.md`, `design/experiments/README.md`, and `design/workflows/` with its role and formula files. Read the replaced `design/system/README.md` too.

Replace template placeholder text with authstar's facts:

- In `design/components/README.md`, list the components `system-flow.yaml` names under `projects` (portcullis, tower, keep, herald, lookout, chronicle, web, steward, the TypeScript clients, the chart hook, and integration), each with its path and kind. Link to `design/system/overview.md` and `design/stories/` rather than copying them.
- In `design/system/README.md`, list `overview.md` and any other system file present.
- Read the planner, orchestrator, analyzer, and curator role files against this project. Change only what the template marks as the project's to set. Record in the narrative what each now says and what was left at the template default.

The story's fourth criterion names `design/system/workflow.md` as an example. Template 1.1.22 does not add that file, so do not invent it. Say so in the story's Notes when the criterion is ticked.

## Done when

- No file this task touches keeps template placeholder text, checked by reading each one and recorded in the narrative.
- `design/components/README.md` names every project in `system-flow.yaml`.
- `flai check --strict` reports nothing on these files.

## Notes

The orchestrator's run on 2026-11-06 failed because `system-flow.yaml` named no orchestration agent harness. Setting one is the operator's host and manifest choice, not this task's. Note it in the narrative if a role file points at it.
