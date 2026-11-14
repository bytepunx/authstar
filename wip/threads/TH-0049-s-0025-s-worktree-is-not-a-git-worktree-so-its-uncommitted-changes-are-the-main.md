---
id: TH-0049
title: S-0025's worktree is not a git worktree, so its 'uncommitted changes' are the main checkout's, most of them not S-0025's
anchor:
  path: wip/kanban/stories/S-0025-a-story-in-review-deploys-into-its-own-kluster-namespace-and-its-teardown.md
  item: S-0025
status: resolved
participants: [agent-S-0025, bytepunx]
created: 2026-11-14T05:42:07Z
updated: 2026-11-14T08:26:32Z
---

# TH-0049 S-0025's worktree is not a git worktree, so its 'uncommitted changes' are the main checkout's, most of them not S-0025's

On wip/kanban/stories/S-0025-a-story-in-review-deploys-into-its-own-kluster-namespace-and-its-teardown.md.

## Entries

### 2026-11-14T05:42:07Z agent-S-0025
`.flai-cache/worktrees/S-0025` is not a git worktree. It holds only an ignored cache file (`.flai-cache/component-props/...`), and `git worktree list` does not list it. `story/S-0025` points at the same commit as main, because S-0025's commits are on main. So `git status` run there falls through to the main checkout at `/home/alex/git/bytepunx/authstar`, and that is what blocks acceptance.

**Committed:** S-0025's own state that flai wrote after the close-out: the story, the narrative, T-0128 to T-0131 and T-0136, TH-0041, TH-0045, TH-0046, and MS-0027 to MS-0031. This is d56231a on main. I fast-forwarded `story/S-0025` to it.

**Not committed, and not S-0025's:**
- Other items' state: S-0006 to S-0008, S-0010, S-0012, S-0013, and S-0017 (with its T-0107 to T-0110 replaced and new T-0137 to T-0139); the archived S-0005; epics E-0002 to E-0005; T-0111; `board.md`; `index.md`.
- The narratives `orchestrator.md`, `curator.md`, `S-0006.md`, and the untracked `S-0017.md`.
- Digests D-0019, D-0025 to D-0027, D-0034, D-0036 (modified) and D-0037 to D-0042 (new).
- Messages MS-0002, MS-0012, MS-0023, MS-0032 to MS-0037; threads TH-0035, TH-0042, TH-0044, TH-0047, TH-0048.
- `scripts/deploy-story.sh`: untracked, written by you at 05:57. It runs `flai kluster up/deploy/teardown/promote` for a story.

While any of this is uncommitted, the main checkout stays dirty, so a check that runs in the S-0025 path will keep refusing.

**Asking:**
1. Should I commit the rest on main, labelled as flai bookkeeping (e.g. `chore: record flai state for S-0006, S-0017, …`, one commit per item group) rather than under S-0025? Or should flai and the other agents commit their own, and should flai instead check the story branch, or recreate S-0025's worktree?
2. `scripts/deploy-story.sh`: should it be committed, or kept out of the repository (for example, ignored)? It is yours, so I have not discarded it.

My recommendation: commit the other items' state on main as unlabelled `chore:` bookkeeping, keep `deploy-story.sh` out of the repository, and record that flai checked a non-worktree path as a flai defect.

### 2026-11-14T07:24:58Z bytepunx
1

### 2026-11-14T08:26:32Z bytepunx
Resolved: S-0025 was accepted
