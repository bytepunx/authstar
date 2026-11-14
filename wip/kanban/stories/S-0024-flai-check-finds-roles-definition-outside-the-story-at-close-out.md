---
id: S-0024
type: story
nature: improvement
title: "flai check finds `roles.definition` outside the story at close-out"
status: backlog
owner: bytepunx
created: 2026-11-09T09:04:35Z
updated: 2026-11-14T09:30:30Z
transitions: []
tags: []
topics: [tooling]
touches: [design/workflows/roles/orchestrator.md, design/workflows/roles/README.md, design/conventions/delegation.md, design/conventions/git.md, design/conventions/safety.md, design/conventions/work-management.md, system-flow.yaml, system-flow.lock.yaml, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/summary.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: planner
      seconds: 1168
      estimated: true
      models:
        - model: claude-haiku-5-5
          input: 30
          output: 124
          cache_read: 590298
          cache_write: 78118
          cost: 0.0429
        - model: claude-opus-5-5
          input: 340
          output: 45167
          cache_read: 16953339
          cache_write: 527731
          cost: 7.8333
    - kind: orchestrator
      seconds: 40
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 15
          output: 119
          cache_read: 589608
          cache_write: 75853
          cost: 0.7584
forecast:
  duration: 30m
  delivery: 2026-11-14T22:46:00Z
  basis: "Its own forecast of 30m; 12th in the pull order with an in-progress limit of 4, behind S-0006, S-0013, S-0012, S-0007, S-0008, S-0010, S-0014, S-0015, S-0016, S-0018, S-0021, S-0022 and S-0023."
  by: flai
  at: 2026-11-14T09:30:30Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:47:54Z
---
# S-0024 flai check finds `roles.definition` outside the story at close-out

## Goal

This story remediates [I-0019](../../../design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md), "flai check finds `roles.definition` outside the story at close-out". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0019 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0019 is closed with `flai issue close I-0019 --reason` saying what fixed it

## Tasks
- T-0121 Upgrade the system-flow template from 1.1.22 to 1.1.24 so the orchestrator role grants verify
- T-0123 Show flai check reports no roles.definition and close I-0019

## Notes

### Planning

Cause, from both instances (S-0011, S-0020) and the template's changelog: flai 1.86.5 refuses `mcp__flai__verify` in `design/workflows/roles/orchestrator.md`'s `definition.tools`, because no entry of the file's own `tools` or a permission's `tools` grants `verify`. The project is on system-flow template 1.1.22. Template 1.1.24 (its S-0556) adds `verify` to the role file's `tools`, and its changelog says a project whose `orchestrator.md` predates it "takes its baseline from `flai upgrade`: until then `flai check` reports `roles.definition`".

Proposed fix: `flai upgrade --ref 1.1.24 --keep-all` (D-0012: upgrades run with `--keep-all`). The six files it changes from 1.1.22 are byte-identical to the 1.1.22 template in this project, so the upgrade replaces them with no conflict. The alternative, adding `verify` to the role file's `tools` by hand, edits a baseline file above its marker and would leave the next upgrade a conflict, so it is not planned. Upgrading past 1.1.24 (1.1.25 onward adds formulas, OpenCode files, and a manifest change) is out of this story's scope.

Test: no project code is involved, so the reproduction is `flai check --strict` unscoped on the upgraded branch, which reports `roles.definition` on main today and must report none after.

Touches, and where each came from (`flai touches suggest` had nothing to start from: the story declared none):

| Path | Source | Why |
|------|--------|-----|
| `design/workflows/roles/orchestrator.md` | design | The file I-0019 names; the upgrade adds `verify` to its `tools` |
| `design/workflows/roles/README.md` | layout | Changed by template 1.1.24 |
| `design/conventions/delegation.md` | layout | Changed by template 1.1.23 to 1.1.24 (S-0556's guard rule among them) |
| `design/conventions/git.md` | layout | Changed by template 1.1.24 |
| `design/conventions/safety.md` | layout | Changed by template 1.1.24 |
| `design/conventions/work-management.md` | layout | Changed by template 1.1.23 and 1.1.24 |
| `system-flow.yaml` | layout | The upgrade records `template.ref` and `version` |
| `system-flow.lock.yaml` | layout | The upgrade records the applied version and file hashes |
| `design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md` | design | Criterion 2 closes it |
| `design/issues/summary.md` | co-change | `flai issue close` rewrites the summary with the issue |

No folder touch is kept. No `after`: the story reads no other story's output. S-0019 (in progress) also touches `system-flow.yaml`, and S-0006's branch edits I-0019's file as it folds I-0015 into it; the trial merge judges both.

Figures:

- Forecast: `flai forecast` gave 3m, from 2 criteria and no touches. Raised to 30m: a conflict-free upgrade of 6 files, an unscoped `flai check`, the issue close, and a close-out whose `system-flow.yaml` change may select every test tier (I-0010). Delivery is flai's, 2026-11-10T09:17:00Z, as 12th in the pull order.
- Cost of delay: `flai cod` cannot work one out, since the story has no inputs and no epic, and I-0019 records no cost. The inputs are the operator's; they are asked for on the plan's thread.
