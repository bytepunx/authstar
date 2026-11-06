---
id: T-0018
type: task
nature: feature
title: "Keep serves GET /tenants/{tenantSlug}/stripe-prices from the tenant's own key"
status: done
parent: S-0008
owner: bytepunx
created: 2026-11-06T17:46:59Z
updated: 2026-11-06T17:53:33Z
transitions:
  - to: ready
    at: 2026-11-06T17:52:02Z
    by: agent-S-0008
  - to: in-progress
    at: 2026-11-06T17:52:02Z
    by: agent-S-0008
  - to: done
    at: 2026-11-06T17:53:33Z
    by: agent-S-0008
stream: S-0008
tags: [keep]
touches: [keep/src/routes/stripe-prices.ts, keep/src/lib/build-app.ts, keep/spec/behavior/stripe-prices.spec.ts, keep/TESTING.md, design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, design/adrs/README.md, design/system/overview.md, keep/src/lib/stripe-client.ts, web/src/lib/server/clients/keep.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts]
after: [T-0016, T-0017]
usage:
  source: log
  seconds: 91
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 42
      output: 10256
      cache_read: 2901247
      cache_write: 55447
      cost: 1.1917
---
# T-0018 Keep serves GET /tenants/{tenantSlug}/stripe-prices from the tenant's own key

## Work

- Add `keep/src/routes/stripe-prices.ts` with `GET /tenants/:tenantSlug/stripe-prices`, gated by `requirePermission('billing:manage')` as `plan-mappings.ts` is. It reads the tenant's secret key from `app.stripeConfig`, dials `app.stripeClients`, and returns `listActivePrices()` as the ADR from T-0016 states.
- Answer `409` when the tenant has no Stripe configuration. Answer `502` when Stripe refuses the key or cannot be reached, and log it once at the boundary with the tenant slug and the error, never the key.
- Register the route in `keep/src/lib/build-app.ts`.
- Write `keep/spec/behavior/stripe-prices.spec.ts` against the fake from T-0017. Cover the listed fields, an inactive price left out, the `403` without `billing:manage`, the `409` without a configuration, and the `502` when the fake throws. Also check that one tenant's call never dials another tenant's key.
- Add the route group to the file list in `keep/TESTING.md`.

## Done when

- The behavior spec passes, and so does `make test` in keep.
- `make integration` in keep still passes.

## Notes

This is the first criterion of S-0008, and the fake half of its third.
