---
id: T-0115
type: task
nature: remediation
title: Give web's Playwright e2e free ports per run and never reuse a running server
status: done
parent: S-0022
owner: bytepunx
created: 2026-11-09T22:09:59Z
updated: 2026-11-14T11:14:19Z
transitions:
  - to: ready
    at: 2026-11-14T11:12:03Z
    by: agent-S-0022
  - to: in-progress
    at: 2026-11-14T11:12:03Z
    by: agent-S-0022
  - to: done
    at: 2026-11-14T11:14:19Z
    by: agent-S-0022
stream: S-0022
tags: [web]
touches: [web/playwright.config.ts, web/e2e/fixtures/urls.ts]
usage:
  source: log
  seconds: 136
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 12
      output: 2101
      cache_read: 1342562
      cache_write: 25496
      cost: 0.5111
---
# T-0115 Give web's Playwright e2e free ports per run and never reuse a running server

## Work

Web's e2e pins the fake backend to port 5175 and the built app to 4173, with `reuseExistingServer` on outside CI. Once the test tier runs web's e2e, a run in one story's worktree would reuse another worktree's server and test the other branch's build. That is the hazard I-0010 records for steward.

- In `web/e2e/fixtures/urls.ts`, read both ports from the environment (`WEB_E2E_BACKEND_PORT`, `WEB_E2E_ADMIN_PORT`), falling back to 5175 and 4173.
- In `web/playwright.config.ts`, when either variable is unset, pick a free loopback port and set the variable in `process.env` before the config builds its URLs. Playwright's workers inherit the runner's environment, so the specs read the same ports.
- Set `reuseExistingServer: false` on both `webServer` entries.
- `web/spec/fixtures/fake-tower-server.ts` already reads `PORT`, so it needs no change.

Waits for nothing.

## Done when

- `npm run test:e2e` in `web` passes while another process listens on 4173 and 5175.
- Two `npm run test:e2e` runs at once, in two checkouts, both pass.
- No e2e spec under `web/e2e` names a port number.

## Notes

Steward's fixed ports stay S-0018's to fix. If S-0018 lands a shared free-port helper first, use it here instead.
