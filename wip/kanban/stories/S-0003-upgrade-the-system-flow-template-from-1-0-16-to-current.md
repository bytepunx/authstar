---
id: S-0003
type: story
nature: improvement
title: Upgrade the system-flow template from 1.0.16 to current
status: ready
parent: E-0001
owner: alex
created: 2026-10-21T04:58:53Z
updated: 2026-10-21T04:58:53Z
transitions:
  - to: ready
    at: 2026-10-21T04:58:53Z
    by: claude
tags: []
after: [S-0001]
---
# S-0003 Upgrade the system-flow template from 1.0.16 to current

## Goal

The repository follows the current system-flow template release, so agents work by the current conventions and `flai` features (strategic agents, experiments, messages, close-out script) are available.

## Acceptance criteria
- [ ] `flai upgrade` has been applied to the newest template release and `system-flow.yaml` and the lock record it
- [ ] Every conflict was resolved deliberately and the project additions below each convention marker are intact
- [ ] `flai check --strict` passes and `make test` still runs
- [ ] New living-design files the template adds (such as `design/system/workflow.md`) are filled for this project, not left as template text

## Tasks

## Notes

`flai upgrade --dry-run` on 2026-10-21 reported template `1.0.105` as newest, with merges for every convention file and conflicts on the files the project edited.
