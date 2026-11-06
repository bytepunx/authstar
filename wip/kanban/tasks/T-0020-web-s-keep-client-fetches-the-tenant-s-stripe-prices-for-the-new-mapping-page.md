---
id: T-0020
type: task
nature: feature
title: Web's keep client fetches the tenant's Stripe prices for the new-mapping page
status: cancelled
parent: S-0008
owner: bytepunx
created: 2026-11-06T17:47:25Z
updated: 2026-11-06T17:51:28Z
transitions:
  - to: cancelled
    at: 2026-11-06T17:51:28Z
    by: agent-S-0008
stream: S-0008
tags: [web]
touches: [web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/spec/behavior/billing-plan-mappings.spec.ts]
after: [T-0016]
---
# T-0020 Web's keep client fetches the tenant's Stripe prices for the new-mapping page

## Work

- Add `listStripePrices(tenantSlug)` to the keep client in `web/src/lib/server/clients/keep.ts`. It calls `GET /tenants/{tenantSlug}/stripe-prices` and returns the fields the ADR from T-0016 states. Add the same call to `web/spec/fixtures/fake-keep-client.ts`, with prices a test can seed and a failure it can set.
- In `web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts`, have `load` return the prices. Leave out a price that an active plan mapping already uses. On a `409` from keep, return no prices and a notice that Stripe is not configured, with a link to `/billing/stripe-config`. On any other keep failure, return no prices and a notice that the list could not be loaded. The page must still render in every case.
- Extend `web/spec/behavior/billing-plan-mappings.spec.ts` to cover the loaded list, the mapped price left out, and both notices.

## Done when

- The behavior spec passes, and so does `make test` in web.

## Notes

This task builds against the fake keep client and the contract in the ADR, so it does not wait for keep's route.
- 2026-11-06T17:51:28Z: moved to cancelled: duplicates T-0026, which covers web's keep client and the page load (TH-0008)
