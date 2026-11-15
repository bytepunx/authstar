---
id: I-0010
title: The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees
class: efficiency
status: closed
count: 13
cost: 11m
first_reported: 2026-11-06T18:29:23Z
last_reported: 2026-11-15T06:13:10Z
updated: 2026-11-15T06:14:04Z
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

### 2026-11-14T10:20:08Z
Story: S-0016.
S-0016 ran `flai test` on `tower/src/lib/spiffe-mtls.ts` and `tower/src/server.ts` only. The tier ran every Node project and stopped after 6m48s on 13 steward Playwright e2e failures, in `operator-console.spec.ts` and `error-page.spec.ts`. S-0016 changes no steward file. At the time, S-0013's worktree was running `playwright test` on the same fixed ports. Tower's behavior tests run after steward's, so they never ran.

### 2026-11-14T10:38:38Z
Story: S-0013.
S-0013's close-out at fd9bf95 (job S-0013-20261114T102955Z) failed 19 of 22 steward e2e tests. Each one hung at 'Connecting...' on steward's fixed port 4611 with the fake tower on 4610, while S-0014 and S-0015, which also change steward, were running in parallel. The code had not changed since b980be4, where every steward suite passed, and both ports were free when I looked afterwards.

### 2026-11-14T10:38:47Z
Story: S-0015.
`flai test` on S-0015's herald, keep, chronicle, steward, and web paths ran every project's suite (8m15s) and failed on steward's e2e: 13 of 16 Playwright cases hung at "Connecting..." on 127.0.0.1:4611. The worktrees of S-0013, S-0014, S-0016, and S-0021 ran steward's e2e within the same two minutes, and `reuseExistingServer` shares the fixed ports 4610 and 4611 across them. S-0015 changes no steward route; web's suite, after steward's in the order, never ran.

### 2026-11-14T10:47:55Z
Story: S-0013.
S-0013's close-out at 5985e15 (job S-0013-20261114T103845Z) failed the same 19 of 22 steward e2e tests: page.goto hit ERR_CONNECTION_REFUSED on 127.0.0.1:4611 once the first 3 tests had passed. Right after, `ps` showed S-0014's worktree running `playwright test` in steward (pid 1337055, started about 8 minutes earlier). That run binds the same fixed ports, 4610 and 4611. Two worktrees running steward's e2e at once is enough to fail both.

### 2026-11-14T10:57:26Z
Story: S-0016.
S-0016's close-out at 8ed3b88 (job S-0016-20261114T105204Z) stopped at the test tier on 12 steward Playwright e2e failures. That commit changes only `design/issues/` files. At the time, S-0021's worktree was running `playwright test` for steward and holding 127.0.0.1:4610. The same suite passed in S-0016's close-out at 51aaf50 an hour earlier.

### 2026-11-14T17:49:28Z
Story: S-0023.
T-0126's `flai test` on three herald spec files ran every project's suite. Herald passed, then the tier failed after 6m54s on steward's Playwright e2e specs (`operator-console`, `stuck-erasure-requests`, `tenant-activity`, `tenant-stuck-erasures`), which S-0023 does not touch.

### 2026-11-14T17:59:58Z
Story: S-0023.
S-0023's close-out job S-0023-20261114T175021Z stopped at the test tier after 9m24s, at c8d23b0. 19 of steward's Playwright e2e tests failed (`operator-console`, `stuck-erasure-requests`, `tenant-activity`, `tenant-stuck-erasures`). S-0021's close-out, job S-0021-20261114T175011Z, started 10 s earlier and passed steward's e2e on the same fixed ports. S-0023 changes no steward file.

### 2026-11-15T06:13:10Z
Story: S-0016.
S-0016's close-out at e6491f6 (job S-0016-20261115T055406Z), right after its rebase onto main for acceptance, stopped at the test tier after 11m43s. Every steward Playwright e2e spec failed, including the specs S-0013 had just added. Several worktrees were syncing and closing out at the same time. The next close-out at the same commit, with no other steward e2e running, passed in 6m49s.

## Remediation

Story S-0018 remediates this issue, created from it at 2026-11-06T21:11:49Z.
Closed 2026-11-15T06:14:04Z: Fixed by S-0018. T-0120: scripts/test.sh takes project names and runs only those, and every project with none. T-0124: system-flow.yaml declares one test tier per project, selected by its folder and running scripts/test.sh <project>, so flai test and the close-out run only the projects a change touches; scripts/test.sh and scripts/lib-projects.sh select every tier. T-0122: steward's Playwright e2e picks two free loopback ports per run and never reuses a server, so runs in other worktrees no longer collide. Reproduced on 2026-11-15 with 4610 held by a decoy and 4611 by S-0023's live steward server: flai test chronicle/src/server.ts ran chronicle alone and passed in 6.3s, and flai test steward/playwright.config.ts ran steward alone and passed in 28.1s (T-0125).
