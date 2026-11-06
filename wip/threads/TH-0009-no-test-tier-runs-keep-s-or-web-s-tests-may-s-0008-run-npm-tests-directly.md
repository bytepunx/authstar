---
id: TH-0009
title: "No test tier runs keep's or web's tests: may S-0008 run npm tests directly?"
anchor:
  path: wip/kanban/stories/S-0008-plan-mapping-editor-picks-from-the-tenant-s-live-stripe-prices.md
  item: S-0008
status: resolved
participants: [agent-S-0008, bytepunx]
created: 2026-11-06T17:51:00Z
updated: 2026-11-06T18:18:02Z
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

### 2026-11-06T18:03:45Z bytepunx
What command should I run to Merge story/S-0002 into main first (yours to do)?

### 2026-11-06T18:04:49Z agent-S-0008
Run these in the main checkout, `/home/alex/git/bytepunx/authstar`, on `main`. The branch exists only on the remote, as `origin/story/S-0002`. A trial merge (`git merge-tree`, which changes nothing) shows three conflicts. S-0004 is in the same state, and its branch merges cleanly, so I would merge both now.

```sh
cd /home/alex/git/bytepunx/authstar
git switch main
git fetch origin
git merge --no-ff origin/story/S-0002 -m "chore: [S-0002] merge the accepted branch into main"
```

Settle the three conflicts:

```sh
# The section on running tests is the only difference: take S-0002's.
git checkout --theirs docs/contributors/index.md
# Generated file: rebuild it from the issue files.
flai issue summary
# By hand: keep main's rows for check.sh, fetch.sh, lint-md.sh and close-out.sh;
# take S-0002's rows for test.sh, integration.sh and smoke.sh; add its install.sh and lib-projects.sh rows.
$EDITOR scripts/README.md
git add docs/contributors/index.md design/issues/summary.md scripts/README.md
git commit --no-edit
```

Then merge S-0004, which has no conflicts, and check:

```sh
git merge --no-ff origin/story/S-0004 -m "chore: [S-0004] merge the accepted branch into main"
flai check --strict
git push origin main
```

`git merge` leaves your uncommitted `wip/` files alone, because neither branch changes them.

After the merge, S-0002's `scripts/test.sh` runs every npm project's `npm test` and portcullis's `cargo test`, and it stops unless `make install` has run. So once you answer, I will sync S-0008, run `make install` in its worktree, test with `flai test`, and fix what fails. I will also renumber S-0008's closed I-0003, because S-0002 brings its own I-0003.

If you'd rather not resolve it yourself, reply "prepare it". I will then do the same merge on a new local branch, `merge/S-0002-S-0004`, in a scratch worktree, and run `flai check`. You would only run `git merge --ff-only merge/S-0002-S-0004` on main and push. I won't touch main myself.

### 2026-11-06T18:16:36Z bytepunx
done

### 2026-11-06T18:18:02Z agent-S-0008
Resolved: The operator merged story/S-0002 and story/S-0004 into main (5263a88, af55c04). S-0008 is synced onto them and will test through flai test after make install.
