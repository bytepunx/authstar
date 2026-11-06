---
id: T-0026
type: task
nature: feature
title: Web's plan-mapping form offers the tenant's live Stripe prices
status: done
parent: S-0008
owner: alex
created: 2026-11-06T17:47:59Z
updated: 2026-11-06T17:51:32Z
transitions:
  - to: ready
    at: 2026-11-06T17:48:07Z
    by: agent-S-0008
  - to: in-progress
    at: 2026-11-06T17:48:44Z
    by: agent-S-0008
  - to: done
    at: 2026-11-06T17:51:32Z
    by: agent-S-0008
stream: S-0008
tags: [web]
touches: [web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/spec/behavior/billing-plan-mappings.spec.ts, docs/users/index.md]
after: [T-0016]
usage:
  source: log
  seconds: 168
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 30
      output: 6672
      cache_read: 3004473
      cache_write: 33246
      cost: 0.9833
---
# T-0026 Web's plan-mapping form offers the tenant's live Stripe prices

## Work

- Add `listStripePrices(tenantSlug)` to web's keep client in `web/src/lib/server/clients/keep.ts`, calling `GET /tenants/{tenantSlug}/stripe-prices` as the ADR from T-0016 states, and to the fake keep client in `web/spec/fixtures/fake-keep-client.ts`.
- The new plan-mapping page's `load` fetches the list. A keep failure (409 no Stripe configuration, 502 Stripe unreachable) does not break the page: it returns an empty list with a notice saying why, and the form still accepts a pasted ID.
- The form offers the prices as choices showing product name, amount, currency, and interval, and submits the chosen price's ID as `stripePriceId`. A free-text field still accepts a pasted price ID for a price the list does not show; a pasted ID wins over the choice when both are given.
- Cover it in `web/spec/behavior/billing-plan-mappings.spec.ts`: the load lists the prices, the load survives a keep failure with a notice, a chosen price is submitted, and a pasted ID is submitted.
- Say in `docs/users/index.md` (or the billing guide it links) that the plan-mapping form lists the tenant's active Stripe prices, and that pasting an ID still works.

## Done when

- The behavior spec passes, and `flai test` on the changed web paths passes, lint and typecheck included.
- S-0008's second criterion is met.

## Notes

The planner's four tasks covered keep only; this task carries the web half of the story. It waits for T-0016 only for the contract, not for keep's code: web's tests run against its fake keep client.
