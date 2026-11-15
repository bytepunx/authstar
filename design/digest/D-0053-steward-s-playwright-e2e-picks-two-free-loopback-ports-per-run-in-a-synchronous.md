---
id: D-0053
title: Steward's Playwright e2e picks two free loopback ports per run in a synchronous child process when its config loads, and never reuses a running server
kind: decision
sources: [S-0018, I-0010, T-0122]
topics: [testing, steward, sveltekit, node]
paths: [steward/playwright.config.ts, steward/tests/e2e/run-fake-backend.ts, steward/tests/helpers/steward-server.ts, steward/TESTING.md]
date: 2026-11-15
status: absorbed
absorbed_by: "docs/contributors/index.md#running-the-tests"
asked_again: []
cited: []
---

# D-0053 Steward's Playwright e2e picks two free loopback ports per run in a synchronous child process when its config loads, and never reuses a running server

Steward's e2e used to pin the fake tower to port 4610 and steward to 4611 with `reuseExistingServer`, so a run in one story's worktree used another worktree's server and failed (I-0010, eleven instances).

S-0018's T-0122 fixed it, and its narrative records under Decisions: "T-0122 follows S-0022's port picker for web (`web/e2e/fixtures/urls.ts` on story/S-0022): pick free ports in a synchronous child process when the config loads, export them through the environment for workers and webServers, never reuse a server." It also records: "T-0122 left `steward/tests/helpers/steward-server.ts` unchanged. Its async `getFreePort` cannot run while the config loads, so the config picks ports synchronously in a child process, as S-0022 does for web."

I-0010's closing note says: "steward's Playwright e2e picks two free loopback ports per run and never reuses a server, so runs in other worktrees no longer collide." T-0125 reproduced it with 4610 held by a decoy and 4611 by S-0023's live steward server: `flai test steward/playwright.config.ts` ran steward alone and passed in 28.1s.

A Playwright config that needs a port follows the same pattern. Web's e2e gets it from S-0022, which was still in progress when S-0018 was accepted.

Source: S-0018, T-0122, I-0010.
