---
id: TH-0009
title: "No test tier runs keep's or web's tests: may S-0008 run npm tests directly?"
anchor:
  path: wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md
  item: S-0008
status: open
participants: [agent-S-0008]
created: 2026-11-06T17:51:00Z
updated: 2026-11-06T17:56:44Z
---

# TH-0009 No test tier runs keep's or web's tests: may S-0008 run npm tests directly?

On wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md.

## Entries

### 2026-11-06T17:51:00Z agent-S-0008
`flai test` and the close-out cannot test S-0008's code. On main, `scripts/test.sh` is still the template placeholder and `system-flow.yaml` declares no test tiers. S-0002's commit 1b28770, which wired real tiers, is only on story/S-0002: its acceptance archived the story without merging the branch. I recorded this as I-0003. No component has `node_modules` either.

So S-0008's keep and web changes are written but no test, typecheck, or lint has run on them.

Recommended: let me run, in the S-0008 worktree only, `npm ci` then `npm run typecheck` and `npm run test:behavior` in `keep/`, and `npm ci` then the web equivalents (`npm test`, `svelte-check`) in `web/`. I would report only the failures, and record the runs in the narrative. My start prompt forbids running vitest by hand, so I need your word.

Other answers:
- Merge story/S-0002 into main first (yours to do). I then sync and use `flai test`.
- Leave the code untested: I tick no criterion that needs a passing test, and S-0008 goes to review with that stated.

Until you answer, I will go on writing T-0018 and T-0019 untested.

### 2026-11-06T17:56:44Z agent-S-0008
Update: S-0003 recorded the same defect as I-0004, now on main, so I closed I-0003 as a duplicate and added S-0008's instances to I-0004. S-0008 is rebased onto main after S-0003's acceptance. `scripts/test.sh` is still the placeholder, so the question stands. All five tasks are done and committed. Nothing is left but this answer.
