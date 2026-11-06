---
id: T-0028
type: task
nature: remediation
title: Web has a root error page with a plain message and a way back
status: backlog
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:48:41Z
updated: 2026-11-06T17:48:41Z
transitions: []
stream: S-0011
tags: [web]
touches: [web/src/routes/+error.svelte, web/spec/components/error-page.spec.ts]
---
# T-0028 Web has a root error page with a plain message and a way back

## Work

- Add `web/src/routes/+error.svelte`. It reads the status and message from `page` in `$app/state` and shows a plain message for each case:
  - 404: the page does not exist.
  - 403: the account has no access.
  - 502 or 503: a service web depends on did not answer.
  - Anything else: something went wrong.
- Give the page a way back: a link to `/` and a control that goes to the previous page. Never show a stack trace or an upstream response body.
- The page renders inside the root layout only. It assumes neither the `(admin)` nav nor a session, so the `(embed)` and `(hosted)` routes can use it too.
- Write a component test, `web/spec/components/error-page.spec.ts`, with `page` mocked. It covers the 404, 403, and 502 messages, the link back, and that the raw message of an unexpected error is not shown.

## Done when

- [ ] Opening a route that does not exist in `web` shows this page, not SvelteKit's default.
- [ ] `web/spec/components/error-page.spec.ts` passes in the component tier.

## Notes

This is the page that the `error(502, …)` thrown by T-0029 lands on. Neither task needs the other to be done first.
