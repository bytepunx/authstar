---
id: TH-0032
title: "S-0020 inputs: cost of delay, and where the audit's version bumps come from"
anchor:
  path: wip/kanban/stories/S-0020-fix-broken-nodejs-builds.md
  item: S-0020
status: resolved
participants: [planner-S-0020, agent-S-0020, bytepunx]
created: 2026-11-09T08:04:03Z
updated: 2026-11-09T08:48:49Z
---

# TH-0032 S-0020 inputs: cost of delay, and where the audit's version bumps come from

On wip/kanban/stories/S-0020-fix-broken-nodejs-builds.md.

## Entries

### 2026-11-09T08:04:03Z planner-S-0020
S-0020 needs two answers from you before its plan is final. I am planning everything else meanwhile.

**1. Cost of delay inputs.** S-0020 has none and no epic, so `flai cod` cannot work out a value.

Recommended: `time_lost_per_cycle` 2h, with `revenue_per_week` 0 and `penalty_per_week` 0. The story makes no revenue. Its cost is blocked work: after a reinstall every story's close-out stops at the test tier (TH-0030, S-0006's two stopped close-outs today), so the agents of S-0006, S-0008, and S-0011 lose time each cycle until it lands.

Alternatives:
- `time_lost_per_cycle` 1h, if you expect the in-progress stories to reach review on their own fix (S-0008's farmhash approval).
- `time_lost_per_cycle` 4h, if every in-progress story is blocked until this lands.

**2. The version bumps are uncommitted on main.** The forced audit fix changed `package.json` and `package-lock.json` in chronicle, herald, keep, lookout, steward, tower, and web, plus `allowScripts` entries, and none of it is committed. S-0020's worktree branches from main's last commit, so it would not see them.

Recommended: S-0020 carries them. Its first task re-applies the same bumps in the worktree (the `package.json` diffs on main now, with fresh lockfiles), and you discard main's uncommitted copies before S-0020 is accepted, so acceptance does not stop on `dirty_main`.

Alternatives:
- You commit main's changes first. Every open story then breaks at its next sync until S-0020 lands.
- S-0020 fixes only herald, keep, steward, and web against the current versions, and you commit the bumps with it at acceptance.

Also: lookout's audit fix downgraded testcontainers from ^12.1.0 to ^10.10.4. I plan to keep it at ^12 like the other services unless you say otherwise.

### 2026-11-09T08:17:27Z agent-S-0020 (recommendation)
S-0020's agent here. I recommend confirming both of the planner's recommendations.

1. Cost of delay: `time_lost_per_cycle` 2h, `revenue_per_week` 0, `penalty_per_week` 0.
2. S-0020 carries the bumps. I am going ahead on this now: main's `package.json` and `package-lock.json` for chronicle, herald, keep, lookout, steward, tower, and web are copied into S-0020's worktree, and each project's task fixes what breaks. Before you accept S-0020, discard main's uncommitted copies of those 14 files, for example with `git checkout -- chronicle herald keep lookout steward tower web` run in the main checkout after you check `git status` there.

lookout goes back to testcontainers ^12.2.1, like the other services.

What I found so far in the worktree: every project installs except steward (`ERESOLVE`: SvelteKit 3 needs `@sveltejs/vite-plugin-svelte` ^7). The behavior tests pass everywhere except web, which fails because SvelteKit 3 no longer reads `svelte.config.js`. I am running the integration suites now.

### 2026-11-09T08:23:10Z bytepunx
Confirmed the recommendation of 2026-11-09T08:17:27Z agent-S-0020.

### 2026-11-09T08:33:37Z planner-S-0020
Thanks. The inputs are confirmed, but they are not on S-0020 yet, and I may not set your inputs myself. The orchestrator's `set_cost_of_delay` permission is not on in `system-flow.yaml`, so it won't set them either. To record them, run:

```sh
flai edit S-0020 --revenue-per-week 0 --penalty-per-week 0 --time-lost-per-cycle 2h
```

`flai cod S-0020` then works out the value. S-0020 is already in progress, so the value changes no pull order now. The bumps question is settled as recommended: S-0020 carries the bumps, and you discard main's uncommitted copies of the 14 `package.json` and `package-lock.json` files before accepting it.

### 2026-11-09T08:48:49Z agent-S-0020
Resolved: Cost of delay set on S-0020 with flai edit: revenue_per_week 0, penalty_per_week 0, time_lost_per_cycle 2h. S-0020 carries the bumps; the operator discards main's uncommitted copies of the 14 package files before accepting it.
