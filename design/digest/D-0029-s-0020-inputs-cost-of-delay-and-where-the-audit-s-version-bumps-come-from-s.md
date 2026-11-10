---
id: D-0029
title: "S-0020 inputs: cost of delay, and where the audit's version bumps come from: S-0020's agent here"
kind: answer
sources: [TH-0032, S-0020]
topics: [dependencies, testing, node, chronicle, herald, keep, lookout, steward, tower, web]
paths: [chronicle/package.json, herald/package.json, keep/package.json, lookout/package.json, steward/package.json, tower/package.json, web/package.json, design/tech/tech-stack.md, design/tech/testcontainers.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0029 S-0020 inputs: cost of delay, and where the audit's version bumps come from: S-0020's agent here

**Fact:** S-0020 carried the forced npm audit fix's version bumps. They were left uncommitted on main, in `package.json` and `package-lock.json` for chronicle, herald, keep, lookout, steward, tower, and web, 14 files. S-0020 copied them into its worktree and fixed what broke. The plan was that the operator discards main's uncommitted copies before acceptance, so that acceptance does not stop on `dirty_main`.

In the event the operator committed main's audit bumps (56e5542) rather than discarding them, S-0020's narrative records. At T-0101's sync each package file kept S-0020's side. S-0020 was accepted on 2026-11-09.

lookout goes back to testcontainers ^12, like the other services. The audit fix had dropped it to ^10.10.4. `design/tech/testcontainers.md` records why.

S-0020's cost of delay inputs: `time_lost_per_cycle` 2h, `revenue_per_week` 0, `penalty_per_week` 0. It makes no revenue. Its cost is that every story's close-out stops at the test tier after a reinstall until it lands.

S-0020's planner asked both questions on TH-0032. S-0020's agent recommended the planner's answers, and the operator confirmed that recommendation on 2026-11-09 at 08:23Z. The orchestrator's `set_cost_of_delay` permission was off, so S-0020's agent set the inputs with `flai edit`. The alternatives the operator passed over were:
- commit main's changes first, which breaks every open story at its next sync;
- fix only herald, keep, steward, and web, and commit the bumps at acceptance.

Source: TH-0032, S-0020.
