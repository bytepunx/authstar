---
id: I-0010
title: The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees
class: efficiency
status: open
count: 6
cost: 11m
first_reported: 2026-11-06T18:29:23Z
last_reported: 2026-11-14T10:38:38Z
updated: 2026-11-14T10:38:38Z
---

# I-0010 The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees

## Description
The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees

## Instances

### 2026-11-06T18:29:23Z
Story: S-0009.
S-0009 ran `flai test` on `chronicle/` only. scripts/test.sh still ran every npm project and then portcullis cargo test, taking 9m11s, and it failed in steward, which S-0009 does not touch. All 12 steward Playwright e2e tests failed with "Can't reach tower. Check your port-forward". steward/playwright.config.ts pins the fake tower to port 4610 and steward to 4611 with reuseExistingServer, so a concurrent run in another story's worktree, or one left behind, serves the wrong backend. Nothing held either port afterwards. Chronicle's suite ran before steward's and passed, since test.sh stops at the first failure. Selecting projects by the changed paths, and giving each run free ports, would make the tier both fast and reliable for parallel stories.

### 2026-11-09T20:54:07Z
Story: S-0006.
S-0006's close-out at fbb0a1d stopped in steward's Playwright e2e (9 failed). S-0006 changes nothing in steward. S-0007's test run was holding 127.0.0.1:4611 (`node build/index.js` from .flai-cache/worktrees/S-0007/steward), and because of reuseExistingServer S-0006's run used S-0007's steward server.

### 2026-11-09T20:59:43Z
Story: S-0006.
S-0006's close-out at 595e4bf: 4611 was free when the run started, and 5 steward e2e specs still failed with net::ERR_CONNECTION_REFUSED at 127.0.0.1:4611/connect partway through. Another worktree's run took the port first, S-0006's Playwright reused that server, and it went away when that run finished.

### 2026-11-09T21:21:04Z
Story: S-0013.
T-0044's flai test on steward paths ran every suite for 9m12s. Then 13 of steward's 16 e2e tests hung on "Connecting...". Run by hand on the same commit, all 16 passed in 7.3s. The next two tier runs at later commits passed. Other stories' agents were running the tier at the same time, so the fixed ports and server reuse are the likely cause.

### 2026-11-13T21:55:06Z
Story: S-0025.
S-0025's close-out at afe869f (job S-0025-20261113T215227Z) stopped at the test tier on 16 steward Playwright e2e failures, all `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4611`. S-0025 changes no steward file. Fixed ports 4610/4611 with reuseExistingServer let the run attach to another worktree's server, which went away mid-run. The same tier passed three times in this worktree earlier the same day.

### 2026-11-14T10:38:38Z
Story: S-0013.
S-0013's close-out at fd9bf95 (job S-0013-20261114T102955Z) failed 19 of 22 steward e2e tests. Each one hung at 'Connecting...' on steward's fixed port 4611 with the fake tower on 4610, while S-0014 and S-0015, which also change steward, were running in parallel. The code had not changed since b980be4, where every steward suite passed, and both ports were free when I looked afterwards.

## Remediation

Story S-0018 remediates this issue, created from it at 2026-11-06T21:11:49Z.
