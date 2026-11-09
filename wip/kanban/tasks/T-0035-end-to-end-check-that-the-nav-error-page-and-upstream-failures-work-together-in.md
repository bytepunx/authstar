---
id: T-0035
type: task
nature: remediation
title: End-to-end check that the nav, error page, and upstream failures work together in web
status: done
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:50:11Z
updated: 2026-11-09T07:58:16Z
transitions:
  - to: ready
    at: 2026-11-09T07:40:51Z
    by: agent-S-0011
  - to: in-progress
    at: 2026-11-09T07:40:52Z
    by: agent-S-0011
  - to: done
    at: 2026-11-09T07:58:16Z
    by: agent-S-0011
stream: S-0011
tags: [web]
touches: [web/e2e/admin-nav-and-errors.spec.ts, web/e2e/fixtures/auth.ts, web/spec/fixtures/fake-tower-server.ts]
after: [T-0027, T-0028, T-0029]
usage:
  source: log
  seconds: 1044
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 34
      output: 10508
      cache_read: 3194415
      cache_write: 43950
      cost: 1.1468
---
# T-0035 End-to-end check that the nav, error page, and upstream failures work together in web

## Work

- Add `web/e2e/admin-nav-and-errors.spec.ts`, using the session fixture in `web/e2e/fixtures/auth.ts` with an account that holds every permission. It checks three things:
  - The nav shows Overview, Applications, and Billing and no link to Identity & Access, Communications, Analytics, Privacy & Compliance, or Settings.
  - Opening `/identity` shows web's error page with its way back, and following the way back lands on `/`.
  - When the fake tower answers 500 for the applications list, `/applications` shows the error page's message for an unreachable service, not SvelteKit's default 500.
- Extend `web/e2e/fixtures/auth.ts` only as far as the third case needs to make the fake tower fail.

## Done when

- [ ] `web/e2e/admin-nav-and-errors.spec.ts` passes with Playwright in `web`, alongside the existing e2e specs.

## Notes

This task waits for T-0027, which hides unbuilt sections, T-0028, which adds the error page, and T-0029, which maps the admin load failure. The test exercises all three together.
