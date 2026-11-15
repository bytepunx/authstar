---
id: T-0123
type: task
nature: remediation
title: Show flai check reports no roles.definition and close I-0019
status: done
parent: S-0024
owner: bytepunx
created: 2026-11-09T22:10:57Z
updated: 2026-11-15T07:12:24Z
transitions:
  - to: ready
    at: 2026-11-15T07:12:15Z
    by: agent-S-0024
  - to: in-progress
    at: 2026-11-15T07:12:15Z
    by: agent-S-0024
  - to: done
    at: 2026-11-15T07:12:24Z
    by: agent-S-0024
stream: S-0024
tags: [tooling, issues]
touches: [design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/summary.md]
after: [T-0121]
usage:
  source: log
  seconds: 9
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 4
      output: 364
      cache_read: 279049
      cache_write: 5009
      cost: 0.1032
---
# T-0123 Show flai check reports no roles.definition and close I-0019

## Work

Waits for T-0121: the check can pass only on the upgraded role file.

Reproduce and clear the cause: run `flai check --strict` unscoped in the main checkout to see the `roles.definition` finding on `design/workflows/roles/orchestrator.md`, then in the story's worktree, and record both results in the narrative. Run `flai role show orchestrator` in the worktree to confirm its definition still lists `mcp__flai__verify`. No project code changes, so no unit test fits; the unscoped check is the reproduction, as the story's Notes say. Then close the issue with `flai issue close I-0019 --commit --reason "<what fixed it>"`, naming the upgrade to template 1.1.24 and its S-0556.

## Done when

- `flai check --strict` unscoped in the worktree reports no `roles.definition`, and the narrative records the before and after.
- I-0019 is closed with a reason naming the template upgrade, and `design/issues/summary.md` no longer lists it as open.
- Criteria 1 and 2 of S-0024 are ticked.

## Notes
