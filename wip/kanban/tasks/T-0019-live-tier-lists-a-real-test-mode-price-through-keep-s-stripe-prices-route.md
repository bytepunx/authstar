---
id: T-0019
type: task
nature: feature
title: Live tier lists a real test-mode price through keep's stripe-prices route
status: done
parent: S-0008
owner: bytepunx
created: 2026-11-06T17:47:05Z
updated: 2026-11-06T17:54:14Z
transitions:
  - to: ready
    at: 2026-11-06T17:53:38Z
    by: agent-S-0008
  - to: in-progress
    at: 2026-11-06T17:53:38Z
    by: agent-S-0008
  - to: done
    at: 2026-11-06T17:54:14Z
    by: agent-S-0008
stream: S-0008
tags: [keep, testing]
touches: [keep/spec/live/stripe-live.spec.ts, keep/TESTING.md]
after: [T-0018]
usage:
  source: log
  seconds: 36
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 23
      output: 5729
      cache_read: 1486854
      cache_write: 30639
      cost: 0.6346
---
# T-0019 Live tier lists a real test-mode price through keep's stripe-prices route

## Work

- Add a `describe` block to `keep/spec/live/stripe-live.spec.ts` that creates a real Product and a recurring Price in test mode. It then calls `GET /tenants/{tenantSlug}/stripe-prices` through the live app, and checks that the price is listed with its product name, amount, currency, and interval.
- Archive the price it created, list again, and check that the price is gone. Clean up as the suite's other blocks do.
- Add a line on the new case to the live-tier section of `keep/TESTING.md`.

## Done when

- `npm run test:live` in keep passes with `STRIPE_LIVE_TEST_SECRET_KEY` set, and it skips cleanly without the key.
- If no test-mode key is available in this environment, the story's Notes say so, and the third criterion stays unchecked.

## Notes

This is the live half of S-0008's third criterion. The suite is opt-in and not part of `make test`, `make integration`, or `make smoke`.
