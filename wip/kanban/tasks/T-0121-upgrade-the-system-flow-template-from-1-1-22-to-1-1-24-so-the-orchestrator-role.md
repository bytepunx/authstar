---
id: T-0121
type: task
nature: remediation
title: Upgrade the system-flow template from 1.1.22 to 1.1.24 so the orchestrator role grants verify
status: done
parent: S-0024
owner: bytepunx
created: 2026-11-09T22:10:49Z
updated: 2026-11-15T07:11:58Z
transitions:
  - to: ready
    at: 2026-11-15T07:11:14Z
    by: agent-S-0024
  - to: in-progress
    at: 2026-11-15T07:11:14Z
    by: agent-S-0024
  - to: done
    at: 2026-11-15T07:11:58Z
    by: agent-S-0024
stream: S-0024
tags: [tooling, template]
touches: [design/workflows/roles/orchestrator.md, design/workflows/roles/README.md, design/conventions/delegation.md, design/conventions/git.md, design/conventions/safety.md, design/conventions/work-management.md, system-flow.yaml, system-flow.lock.yaml, design/system/README.md]
usage:
  source: log
  seconds: 44
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 9
      output: 901
      cache_read: 691052
      cache_write: 12404
      cost: 0.2555
---
# T-0121 Upgrade the system-flow template from 1.1.22 to 1.1.24 so the orchestrator role grants verify

## Work

In the story's worktree, run `flai upgrade --ref 1.1.24 --keep-all` (D-0012). Template 1.1.24 (its S-0556) adds `verify` to `tools` in `design/workflows/roles/orchestrator.md`, which grants the `mcp__flai__verify` its `definition.tools` already lists. The six files the upgrade changes are unchanged from the 1.1.22 template here, so none should conflict. If one does, merge the template's text into it by hand and say so in the narrative's `## Decisions`.

Waits for nothing: it is the first layer.

## Done when

- `system-flow.yaml` and `system-flow.lock.yaml` record template version 1.1.24.
- `design/workflows/roles/orchestrator.md`'s `tools` lists `verify`.
- The upgrade left no unresolved conflict, and `git status` lists only the upgrade's files.

## Notes
