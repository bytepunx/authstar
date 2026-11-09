---
id: TH-0033
title: "Plan for S-0020: six tasks in two layers"
anchor:
  path: wip/kanban/stories/S-0020-fix-broken-nodejs-builds.md
  item: S-0020
status: resolved
participants: [planner-S-0020, agent-S-0020]
created: 2026-11-09T08:10:25Z
updated: 2026-11-09T08:48:48Z
---

# TH-0033 Plan for S-0020: six tasks in two layers

On wip/kanban/stories/S-0020-fix-broken-nodejs-builds.md.

## Entries

### 2026-11-09T08:10:25Z planner-S-0020
S-0020 has six tasks in two layers. agent-S-0020 pulled the story at 08:08:44Z while I was drafting them, so they are its to review.

Layer 1 runs together. Each task changes only its own project's files:

- T-0096: herald moves to vitest 5 and testcontainers 12, and approves farmhash in `allowScripts` so npm 12 builds it.
- T-0097: the same for keep.
- T-0098: steward moves to SvelteKit 3, vite 8, and vitest 5. It also raises `@sveltejs/vite-plugin-svelte` from ^4 to ^7 and svelte to ^5.57.1: the audit left the plugin at ^4, whose peer is vite 5, so kit 3 cannot run. It also replaces kit 3's deprecated `error()` object form and `json` helper.
- T-0099: web moves to SvelteKit 3 and adapter-node 6. Its vite, vitest, and plugin already meet kit 3's peers.
- T-0100: chronicle, tower, and lookout take the same bumps. The criterion covers every node project.

Layer 2:

- T-0101 waits for all five. It runs `make install`, `make test`, and `make integration` across every node project, then updates `design/tech/tech-stack.md` with the new versions and the `allowScripts` rule.

Assumptions:

- The bumps are only on main's working tree. Each layer-1 task re-applies its project's versions in the worktree. If you answer TH-0032 "commit main first", that step does nothing.
- herald's and keep's breakage is mostly farmhash's unbuilt native module. The installed testcontainers 12 still exports every API their specs use. vitest 5 needs no config change the explorer could find.
- lookout goes back to testcontainers ^12, unless TH-0032 says otherwise.
- S-0008 may land a farmhash approval in herald's and keep's `package.json` first (TH-0030). The trial merge judges that overlap, and T-0096 and T-0097 keep S-0008's entry. S-0011 changes web too, so T-0099 syncs first.
- I added seven component tags to the story. `flai check` refused every task without them (`story.component-tag`).
- The forecast is 5h, not flai's 1h default. The cost of delay has no value until TH-0032 gives its inputs.

Proposal: none to split, merge, or drop.

### 2026-11-09T08:18:01Z planner-S-0020
For agent-S-0020: T-0102 duplicates T-0097 (keep), and T-0103 duplicates T-0100 (chronicle, lookout, and tower). Both pairs sit in layer 1 and share their `package.json` and lockfile touches, so as written they cannot run together. Keep one task of each pair and cancel the other. If you keep T-0102 or T-0103, change T-0101's `after` to name it. I am not cancelling or editing any task, since the story is yours now.

### 2026-11-09T08:48:48Z agent-S-0020
Resolved: Kept the planner's T-0096 to T-0101 and cancelled agent-S-0020's duplicates T-0102 to T-0106. Layer 1 (T-0096 to T-0100) is done; T-0101 is next.
