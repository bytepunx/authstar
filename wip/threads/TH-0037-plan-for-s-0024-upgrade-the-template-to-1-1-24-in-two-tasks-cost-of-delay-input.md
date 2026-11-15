---
id: TH-0037
title: "Plan for S-0024: upgrade the template to 1.1.24 in two tasks; cost of delay input needed"
anchor:
  path: wip/kanban/stories/S-0024-flai-check-finds-roles-definition-outside-the-story-at-close-out.md
  item: S-0024
status: resolved
participants: [planner-S-0024, bytepunx]
created: 2026-11-09T22:11:16Z
updated: 2026-11-15T19:30:04Z
---

# TH-0037 Plan for S-0024: upgrade the template to 1.1.24 in two tasks; cost of delay input needed

On wip/kanban/stories/S-0024-flai-check-finds-roles-definition-outside-the-story-at-close-out.md.

## Entries

### 2026-11-09T22:11:16Z planner-S-0024
**Question: cost of delay input.** S-0024 has no cost of delay inputs and no epic, and I-0019 records no cost, so `flai cod` cannot work out a value.

Recommended: `time_lost_per_cycle` 5m. Each close-out prints the finding as a note and bumps I-0019, and an agent spends a few minutes reading it. The orchestrator is also refused the `verify` tool until this lands, which slows its acceptances. For comparison, the sibling issue stories carry 10m to 20m.

Alternatives: 10m, if the orchestrator's refused `verify` costs you acceptances; or 0, if it can wait for a later full template upgrade.

**Cause and proposed fix.** flai 1.86.5 refuses `mcp__flai__verify` in `design/workflows/roles/orchestrator.md`'s `definition.tools`, since nothing in the file's `tools` grants `verify`. Template 1.1.24 (its S-0556) adds `verify` there, and its changelog says such a project "takes its baseline from `flai upgrade`".

Fix: `flai upgrade --ref 1.1.24 --keep-all` (D-0012). The six files it changes are byte-identical to the 1.1.22 template here, so none conflicts.

**Tasks and layers.**

| Layer | Task | After | Touches |
|-------|------|-------|---------|
| 1 | T-0121 Upgrade the template from 1.1.22 to 1.1.24 | none | `orchestrator.md`, roles `README.md`, 4 conventions, `system-flow.yaml`, `system-flow.lock.yaml` |
| 2 | T-0123 Show `flai check` reports no `roles.definition` and close I-0019 | T-0121 | I-0019's file, `design/issues/summary.md` |

**Figures.**

- Forecast: 30m, raised from flai's 3m (2 criteria, no touches) for the upgrade, an unscoped check, the issue close, and a close-out that may run every tier (I-0010). Delivery 2026-11-10T09:17:00Z, as flai gave it.
- Cost of delay: waits on the question above.

**Assumptions.**

- The story's scope stops at 1.1.24. Templates 1.1.25 to 1.1.29 add formulas, OpenCode files, and a manifest change; that belongs to a story of its own, if you want it.
- No hand edit of the role file's front matter: it is baseline text, and a hand edit would make the next upgrade conflict.
- The reproduction is the unscoped `flai check --strict`; no project code changes, so no unit test fits criterion 1.
- S-0019 (in progress) also touches `system-flow.yaml`, and S-0006's branch edits I-0019's file as it folds I-0015 in. No `after` for either; the trial merge judges them.

### 2026-11-14T10:08:42Z planner-S-0024
**Replan, 2026-11-14.** No entry from the operator was found on this thread or on S-0024 since the last plan, so the plan stands. The figures are refreshed.

**Still needed: a cost of delay input.** S-0024 has no inputs and no epic, so `flai cod` cannot work out a value.

Recommended: `time_lost_per_cycle` 10m, up from the 5m I proposed on 2026-11-09. I-0019 now has seven instances in five days (S-0006, S-0011, S-0020, S-0019, S-0005, S-0025, S-0017). Every close-out prints the finding and bumps the issue, and the orchestrator's role still lists `verify` without the grant for it.

Alternatives: 5m, if reading the note costs an agent only a moment; or 0, if it can wait for a later full template upgrade.

**What changed.**

- The project is still on template 1.1.22. None of the six files the upgrade replaces has a commit since db4eff1, so `flai upgrade --ref 1.1.24 --keep-all` should still apply with no conflict. The planner cannot dry-run it; T-0121 handles a conflict if one appears.
- Forecast: flai now gives 26m (size 12, with the ten touches counted). I raised it to 30m for the unscoped check and a close-out that may run every tier (I-0010). Delivery 2026-11-17T00:24:00Z, 10th in the pull order.
- Overlaps: no story in progress or in review touches `system-flow.yaml` or I-0019's file now. Ready stories S-0007 and S-0008 touch `design/issues/summary.md`, which flai regenerates. Still no `after`.

**Tasks.** Both revisited; no change to their words, touches, or `after`.

| Layer | Task | After |
|-------|------|-------|
| 1 | T-0121 Upgrade the template from 1.1.22 to 1.1.24 | none |
| 2 | T-0123 Show `flai check` reports no `roles.definition` and close I-0019 | T-0121 |

**Assumptions.** Unchanged. Scope stops at 1.1.24. The role file gets no hand edit. The unscoped `flai check --strict` serves as the reproduction.

### 2026-11-15T19:30:04Z bytepunx
Resolved: S-0024 was accepted
