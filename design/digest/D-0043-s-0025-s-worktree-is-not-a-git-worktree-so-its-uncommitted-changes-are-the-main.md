---
id: D-0043
title: "S-0025's worktree is not a git worktree, so its 'uncommitted changes' are the main checkout's, most of them not S-0025's: 1"
kind: answer
sources: [TH-0049, S-0025, TH-0050]
topics: [git, workflow, kluster, all]
paths: [scripts/deploy-story.sh]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: [S-0025]
---

# D-0043 S-0025's worktree is not a git worktree, so its 'uncommitted changes' are the main checkout's, most of them not S-0025's: 1

When a story's worktree path is not a git worktree, `git status` there falls through to the main checkout, so flai state other agents left uncommitted on main blocks the story's acceptance. The operator chose to commit that state on main as bookkeeping, labelled for its own item.

S-0025's agent found on TH-0049 that `.flai-cache/worktrees/S-0025` held only an ignored cache folder, `git worktree list` did not list it, and `story/S-0025` pointed at main's commit, since S-0025's commits were on main. The main checkout held uncommitted flai state of other stories, epics, narratives, digest entries, messages, and threads, and an untracked `scripts/deploy-story.sh` of the operator's. It recommended: "commit the other items' state on main as unlabelled `chore:` bookkeeping, keep `deploy-story.sh` out of the repository, and record that flai checked a non-worktree path as a flai defect."

The operator, bytepunx, answered at 2026-11-14T07:24:58Z: "1", and told the agent to name S-0025. S-0025's narrative: "each bookkeeping commit is labelled for its own item (S-0017, S-0006, S-0005, E-0002), and its body names S-0025 and TH-0049 as the reason it was committed from here."

The agent read the answer as settling the commits only, and asked about `scripts/deploy-story.sh` on TH-0050. That went undecided: the agent reopened the worktree with `flai stream open S-0025` at the operator's request, which made the path a real worktree, so the untracked file no longer blocked acceptance, and TH-0050 was resolved when S-0025 was accepted. Whether that script belongs in the repository is still the operator's call.

Source: TH-0049, S-0025, TH-0050.
