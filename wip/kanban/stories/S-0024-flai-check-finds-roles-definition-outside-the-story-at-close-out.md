---
id: S-0024
type: story
nature: improvement
title: "flai check finds `roles.definition` outside the story at close-out"
status: review
owner: bytepunx
created: 2026-11-09T09:04:35Z
updated: 2026-11-15T07:27:28Z
transitions:
  - to: ready
    at: 2026-11-14T10:09:21Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-15T07:10:25Z
    by: agent-S-0024
  - to: review
    at: 2026-11-15T07:27:28Z
    by: agent-S-0024
tags: []
topics: [tooling]
touches: [design/workflows/roles/orchestrator.md, design/workflows/roles/README.md, design/conventions/delegation.md, design/conventions/git.md, design/conventions/safety.md, design/conventions/work-management.md, system-flow.yaml, system-flow.lock.yaml, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/issues/summary.md, design/system/README.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 1040
  priced_by: harness
  turns:
    - day: 2026-11-15
      ceremony: 3
      work: 63
  models:
    - model: claude-opus-5-5
      input: 138
      output: 13210
      cache_read: 10132179
      cache_write: 181860
      cost: 3.7461
  strategic:
    - kind: planner
      seconds: 1174
      estimated: true
      models:
        - model: claude-haiku-5-5
          input: 30
          output: 124
          cache_read: 590298
          cache_write: 78118
          cost: 0.0429
        - model: claude-opus-5-5
          input: 342
          output: 45495
          cache_read: 17064924
          cache_write: 530360
          cost: 7.8832
    - kind: orchestrator
      seconds: 48
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 18
          output: 147
          cache_read: 694191
          cache_write: 90332
          cost: 0.8955
forecast:
  duration: 30m
  delivery: 2026-11-30T06:00:00Z
  basis: "Its own forecast of 30m; 5th in the pull order with an in-progress limit of 4, behind S-0014, S-0021, S-0022, S-0012, S-0007, S-0008 and S-0010."
  by: flai
  at: 2026-11-15T07:10:14Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:47:54Z
---
# S-0024 flai check finds `roles.definition` outside the story at close-out

## Goal

This story remediates [I-0019](../../../design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md), "flai check finds `roles.definition` outside the story at close-out". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [x] The cause I-0019 describes no longer occurs, with a test that reproduces it where one fits
- [x] I-0019 is closed with `flai issue close I-0019 --reason` saying what fixed it

## Tasks
- T-0121 Upgrade the system-flow template from 1.1.22 to 1.1.24 so the orchestrator role grants verify
- T-0123 Show flai check reports no roles.definition and close I-0019

## Notes

### Planning

Cause, from its instances (seven by 2026-11-13: S-0006, S-0011, S-0020, S-0019, S-0005, S-0025, S-0017) and the template's changelog: flai refuses `mcp__flai__verify` in `design/workflows/roles/orchestrator.md`'s `definition.tools`, because no entry of the file's own `tools` or a permission's `tools` grants `verify`. The project is still on system-flow template 1.1.22 (`system-flow.yaml`, `system-flow.lock.yaml`, checked 2026-11-14). Template 1.1.24 (its S-0556) adds `verify` to the role file's `tools`, and its changelog says a project whose `orchestrator.md` predates it "takes its baseline from `flai upgrade`: until then `flai check` reports `roles.definition`".

Proposed fix: `flai upgrade --ref 1.1.24 --keep-all` (D-0012: upgrades run with `--keep-all`). The six files it changes from 1.1.22 have had no commit since the 1.1.22 upgrade (db4eff1), so the upgrade should replace them with no conflict. The alternative, adding `verify` to the role file's `tools` by hand, edits a baseline file above its marker and would leave the next upgrade a conflict, so it is not planned. Upgrading past 1.1.24 (1.1.25 onward adds formulas, OpenCode files, and a manifest change) is out of this story's scope.

Test: no project code is involved, so the reproduction is `flai check --strict` unscoped on the upgraded branch, which reports `roles.definition` on main today and must report none after.

Touches, and where each came from. The story's ten declared touches are kept; `flai touches suggest` on them lists only co-changes of past template upgrades and issue bumps (I-0010, other conventions, `CLAUDE.md`), none of which 1.1.23 or 1.1.24 changes, so none is added.

| Path | Source | Why |
|------|--------|-----|
| `design/workflows/roles/orchestrator.md` | declared, design | The file I-0019 names; the upgrade adds `verify` to its `tools` |
| `design/workflows/roles/README.md` | declared, layout | Changed by template 1.1.24 |
| `design/conventions/delegation.md` | declared, layout | Changed by template 1.1.23 to 1.1.24 (S-0556's guard rule among them) |
| `design/conventions/git.md` | declared, layout | Changed by template 1.1.24 |
| `design/conventions/safety.md` | declared, layout | Changed by template 1.1.24 |
| `design/conventions/work-management.md` | declared, layout | Changed by template 1.1.23 and 1.1.24 |
| `system-flow.yaml` | declared, layout | The upgrade records `template.ref` and `version` |
| `system-flow.lock.yaml` | declared, layout | The upgrade records the applied version and file hashes |
| `design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md` | declared, design | Criterion 2 closes it |
| `design/issues/summary.md` | declared, co-change | `flai issue close` rewrites the summary with the issue |

No folder touch is kept. No `after`: the story reads no other story's output. No story in progress or review touches `system-flow.yaml` or I-0019's file today; ready stories S-0007 and S-0008 touch `design/issues/summary.md`, which flai regenerates, and the trial merge judges that.

Figures:

- Forecast: `flai forecast` now gives 26m (126 s per unit of size over 9 done stories, size 12 from 2 criteria and 10 touches). Raised to 30m: the unscoped `flai check` and a close-out whose `system-flow.yaml` change may select every test tier (I-0010). Delivery is flai's, 2026-11-17T00:24:00Z, as 10th in the pull order.
- Cost of delay: `flai cod` cannot work one out, since the story has no inputs and no epic, and I-0019 records no cost. The inputs are the operator's; they are asked for on TH-0037, still unanswered.
