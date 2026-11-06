---
id: T-0057
type: task
nature: feature
title: Web's keep client creates a checkout session, and the fake does too
status: backlog
parent: S-0007
owner: bytepunx
created: 2026-11-06T18:09:32Z
updated: 2026-11-06T18:09:32Z
transitions: []
stream: S-0007
tags: [web]
touches: [web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts]
---
# T-0057 Web's keep client creates a checkout session, and the fake does too

## Work

Add `createCheckoutSession(tenantSlug, { planMappingId, scope, successUrl, cancelUrl, customerEmail? })` to the `KeepClient` interface and its HTTP implementation in `web/src/lib/server/clients/keep.ts`. It calls `POST /tenants/{tenantSlug}/checkout-sessions` (`keep/src/routes/checkout-sessions.ts`) and returns `{ id, url }`. It maps keep's 404 (unknown mapping), 409 (retired mapping, or no Stripe configuration), and 403 to errors the page can tell apart.

Add the same method to `createFakeKeepClient` in `web/spec/fixtures/fake-keep-client.ts`. The fake records each call. It answers a fixed Stripe URL, or each of those errors, as its options say.

This task waits for no other task.

## Done when

- The client and the fake both expose `createCheckoutSession` with the same types.
- `npm run check` in `web/` passes.
- The fake's options select each of keep's error answers.

## Notes

Planned by planner-S-0007. S-0008 changes both files too, to list Stripe prices. A trial merge judges the overlap.
