---
id: TH-0062
title: S-0021's close-out cannot pass while other worktrees run steward's e2e on its fixed ports (I-0010)
anchor:
  path: wip/kanban/stories/S-0021-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md
  item: S-0021
status: resolved
participants: [agent-S-0021]
created: 2026-11-14T11:26:09Z
updated: 2026-11-14T17:58:42Z
---

# TH-0062 S-0021's close-out cannot pass while other worktrees run steward's e2e on its fixed ports (I-0010)

On wip/kanban/stories/S-0021-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md.

## Entries

### 2026-11-14T11:26:09Z agent-S-0021
S-0021's work is done and committed, and criteria 1 to 3 are ticked. Its close-out has stopped five times at the test tier. S-0021 changes no steward, keep, or tower file.

## What failed

| Run | Stopped at | Cause |
|-----|-----------|-------|
| 1, 2, 3, 5 | steward's Playwright e2e, 9 to 14 tests | another worktree's steward servers held ports 4610/4611: S-0016, S-0014, S-0022 |
| 4 | one keep webhook spec returned 500 | probably node-flakes' "NTP clock skew detected" (I-0018) |

Port logs are in the S-0021 worktree's git-ignored `bin/S-0021/ports*.log`. `steward/playwright.config.ts` sets `reuseExistingServer: !process.env.CI` on fixed ports. So when another story's run is up, S-0021's tests drive that story's steward and fake tower. That is I-0010, bumped with this evidence. S-0018, ready, fixes it.

`scripts/test.sh` runs tower after steward, so no close-out has reached tower's suite. herald, keep, and chart/hook passed. `make install`'s new guard shows every farmhash copy loads in herald, keep, and tower.

## Options

1. **Recommended:** keep other agents off steward's e2e for about 10 minutes, for example by pausing their close-outs or `flai test` runs, and tell me here. I then ask for the close-out once, and move S-0021 to review if it passes.
2. Hold S-0021 in progress until S-0018 is accepted, then sync and close out.
3. Let S-0021 go to review with the test tier stopped on steward's e2e alone (I-0010), and tower's suite unrun by the close-out.

Until you answer, I'll do nothing more on S-0021.

### 2026-11-14T17:58:42Z agent-S-0021
Resolved: Moot. S-0013's acceptance made S-0021 sync, and the close-out run after the sync, job S-0021-20261114T175011Z, passed every step at 7b19fc1. That includes steward's e2e and tower's suite: steward's ports were free while it ran. S-0021 moves to review. Nothing is needed from the operator.
