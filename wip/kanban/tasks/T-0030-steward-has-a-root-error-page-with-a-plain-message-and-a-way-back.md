---
id: T-0030
type: task
nature: remediation
title: Steward has a root error page with a plain message and a way back
status: backlog
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:49:14Z
updated: 2026-11-06T17:49:14Z
transitions: []
stream: S-0011
tags: [steward]
touches: [steward/src/routes/+error.svelte, steward/tests/e2e/error-page.spec.ts]
---
# T-0030 Steward has a root error page with a plain message and a way back

## Work

- Add `steward/src/routes/+error.svelte`. It shows a plain message for the status from `page` in `$app/state`, with a link back to `/tenants` when connected and to `/connect` otherwise. Never show a stack trace or an upstream response body.
- Steward sets `ssr = false` and has no component-test setup. Cover the page with a Playwright test, `steward/tests/e2e/error-page.spec.ts`, against the built server and the fake backend in `steward/tests/e2e/run-fake-backend.ts`. Open a route that does not exist, check the message, and follow the link back.

## Done when

- [ ] Opening a route that does not exist in `steward` shows this page, not SvelteKit's default.
- [ ] `npm run test:e2e` in `steward` passes, `steward/tests/e2e/error-page.spec.ts` included.

## Notes

Adding jsdom and `@testing-library/svelte` to steward for one page would be a new dependency. The e2e tier covers the page without one.
