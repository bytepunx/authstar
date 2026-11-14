---
id: D-0043
title: "S-0025's worktree is not a git worktree, so its 'uncommitted changes' are the main checkout's, most of them not S-0025's: 1"
kind: answer
sources: [TH-0049]
topics: [kluster, deployment, integration, shell, code, all]
paths: [scripts/lib-kluster.sh, scripts/kluster-deploy.sh, scripts/kluster-teardown.sh, scripts/README.md, integration/README.md, scripts/kluster-signet-remove.mjs, design/issues/I-0023-flai-s-kept-kluster-kubeconfig-goes-stale-when-the-k3d-containers-restart-and.md, design/issues/summary.md, design/issues/I-0024-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0043 S-0025's worktree is not a git worktree, so its 'uncommitted changes' are the main checkout's, most of them not S-0025's: 1

The operator, bytepunx, answered TH-0049 at 2026-11-14T07:24:58Z.

What was asked:

```text
`.flai-cache/worktrees/S-0025` is not a git worktree. It holds only an ignored cache file (`.flai-cache/component-props/...`), and `git worktree list` does not list it. `story/S-0025` points at the same commit as main, because S-0025's commits are on main. So `git status` run there falls through to the main checkout at `/home/alex/git/bytepunx/authstar`, and that is what blocks acceptance.
```

The answer:

```text
1
```

Source: TH-0049.
