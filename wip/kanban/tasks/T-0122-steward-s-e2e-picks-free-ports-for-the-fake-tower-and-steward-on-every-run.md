---
id: T-0122
type: task
nature: remediation
title: Steward's e2e picks free ports for the fake tower and steward on every run
status: backlog
parent: S-0018
owner: bytepunx
created: 2026-11-09T22:10:54Z
updated: 2026-11-09T22:10:54Z
transitions: []
stream: S-0018
tags: [testing, steward]
touches: [steward/playwright.config.ts, steward/tests/e2e/run-fake-backend.ts, steward/tests/helpers/steward-server.ts, steward/TESTING.md]
---
# T-0122 Steward's e2e picks free ports for the fake tower and steward on every run

## Work

`steward/playwright.config.ts` pins the fake tower to port 4610 and steward to 4611 with `reuseExistingServer`, and `steward/tests/e2e/run-fake-backend.ts` pins 4610 again. A run in another worktree, or one left behind, then serves the wrong backend, as I-0010's instance found.

Pick both ports free on each run instead. Playwright evaluates its config in the runner and again in each worker, so choose the ports once: read them from the environment when set, otherwise take free ones with `getFreePort` from `steward/tests/helpers/steward-server.ts` and write them to the environment, which the workers inherit. Pass the fake tower's port to `run-fake-backend.ts` through the environment, and steward's `TOWER_URL` from it. Set `reuseExistingServer` to false for both web servers, so a run never takes over a server it did not start.

Update `steward/TESTING.md`, which says the fake backend runs on a fixed port.

This task waits for none: it shares no path with the other first-layer task.

## Done when

- `npm run test:e2e` in `steward` passes while another process listens on 4610 and 4611.
- Two `npm run test:e2e` runs at once, from two checkouts, both pass.
- No file under `steward/` names 4610 or 4611.
- `steward/TESTING.md` says how the e2e tier picks its ports.

## Notes
