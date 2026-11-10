---
id: TH-0037
title: "Plan for S-0024: upgrade the template to 1.1.24 in two tasks; cost of delay input needed"
anchor:
  path: wip/kanban/stories/S-0024-flai-check-finds-roles-definition-outside-the-story-at-close-out.md
  item: S-0024
status: open
participants: [planner-S-0024]
created: 2026-11-09T22:11:16Z
updated: 2026-11-09T22:11:16Z
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
