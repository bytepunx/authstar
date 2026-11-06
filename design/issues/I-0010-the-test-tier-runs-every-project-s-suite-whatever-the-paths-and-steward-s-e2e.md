---
id: I-0010
title: The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees
class: efficiency
status: open
count: 1
cost: 15m
first_reported: 2026-11-06T18:29:23Z
last_reported: 2026-11-06T18:29:23Z
updated: 2026-11-06T18:29:23Z
---

# I-0010 The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees

## Description
The test tier runs every project's suite whatever the paths, and steward's e2e uses fixed ports shared across worktrees

## Instances

### 2026-11-06T18:29:23Z
Story: S-0009.
S-0009 ran `flai test` on `chronicle/` only. scripts/test.sh still ran every npm project and then portcullis cargo test, taking 9m11s, and it failed in steward, which S-0009 does not touch. All 12 steward Playwright e2e tests failed with "Can't reach tower. Check your port-forward". steward/playwright.config.ts pins the fake tower to port 4610 and steward to 4611 with reuseExistingServer, so a concurrent run in another story's worktree, or one left behind, serves the wrong backend. Nothing held either port afterwards. Chronicle's suite ran before steward's and passed, since test.sh stops at the first failure. Selecting projects by the changed paths, and giving each run free ports, would make the tier both fast and reliable for parallel stories.

## Remediation
