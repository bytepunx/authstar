---
id: T-0035
type: task
nature: remediation
title: End-to-end check that the nav, error page, and upstream failures work together in web
status: backlog
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:50:11Z
updated: 2026-11-06T17:50:11Z
transitions: []
stream: S-0011
tags: [web]
touches: [web/e2e/admin-nav-and-errors.spec.ts, web/e2e/fixtures/auth.ts]
after: [T-0027, T-0028, T-0029]
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
