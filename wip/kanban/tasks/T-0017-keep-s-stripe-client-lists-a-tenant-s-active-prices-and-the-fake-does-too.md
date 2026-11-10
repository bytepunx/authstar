---
id: T-0017
type: task
nature: feature
title: Keep's Stripe client lists a tenant's active prices, and the fake does too
status: done
parent: S-0008
owner: bytepunx
created: 2026-11-06T17:46:51Z
updated: 2026-11-06T17:51:12Z
transitions:
  - to: ready
    at: 2026-11-06T17:48:07Z
    by: agent-S-0008
  - to: in-progress
    at: 2026-11-06T17:48:44Z
    by: agent-S-0008
  - to: done
    at: 2026-11-06T17:51:12Z
    by: agent-S-0008
stream: S-0008
tags: [keep]
touches: [keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts]
usage:
  source: log
  seconds: 148
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 14
      output: 3031
      cache_read: 1696657
      cache_write: 35116
      cost: 0.6751
---
# T-0017 Keep's Stripe client lists a tenant's active prices, and the fake does too

## Work

- Add `listActivePrices()` to the `StripeClient` interface in `keep/src/lib/stripe-client.ts`. It returns `StripePriceListing[]` with `id`, `productName`, `unitAmount`, `currency`, and `interval` (null for a one-off price).
- Implement it on the real client with `prices.list({ active: true, expand: ['data.product'] })`. Follow every page with the SDK's auto-pagination. Drop prices whose product is inactive or deleted.
- Add a seedable `priceListings` collection to `FakeStripeState` in `keep/spec/lib/fake-stripe-client.ts`. Make the fake client return its active entries, so behavior tests can seed active and inactive prices. A key the fake does not hold makes it throw, as a refused key does in Stripe.

## Done when

- `StripeClient` declares `listActivePrices()`, and both the real client and the fake implement it.
- `npm run typecheck` (or the project's equivalent) and `make test` in keep pass.

## Notes

The route that calls this is the next task. This task only gives keep the call, and the fake that its behavior tests use.
