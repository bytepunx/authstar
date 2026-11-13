---
id: T-0061
type: task
nature: feature
title: Web serves /_authstar/upgrade, sends the chosen plan to Stripe, and confirms the return
status: done
parent: S-0007
owner: bytepunx
created: 2026-11-06T18:09:50Z
updated: 2026-11-09T21:31:52Z
transitions:
  - to: ready
    at: 2026-11-09T21:10:39Z
    by: agent-S-0007
  - to: in-progress
    at: 2026-11-09T21:10:39Z
    by: agent-S-0007
  - to: done
    at: 2026-11-09T21:31:52Z
    by: agent-S-0007
stream: S-0007
tags: [web]
touches: [web/src/routes/(hosted)/_authstar/upgrade/+page.server.ts, web/src/routes/(hosted)/_authstar/upgrade/+page.svelte, web/src/routes/(hosted)/_authstar/upgrade/success/+page.svelte, web/src/routes/(hosted)/_authstar/upgrade/cancelled/+page.svelte, web/spec/behavior/hosted-upgrade.spec.ts, web/e2e/hosted-upgrade.spec.ts, web/TESTING.md, web/playwright.config.ts, web/spec/fixtures/fake-tower-server.ts]
after: [T-0057]
usage:
  source: log
  seconds: 1273
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 113
      output: 29980
      cache_read: 12897941
      cache_write: 347564
      cost: 5.3639
---
# T-0061 Web serves /_authstar/upgrade, sends the chosen plan to Stripe, and confirms the return

## Work

Add the hosted upgrade page under `web/src/routes/(hosted)/_authstar/upgrade/`, as ADR-0065 decides:

- The page's `load` calls `requireSession` (`web/src/lib/server/guard.ts`), since `(hosted)` has no guard layout. It lists the tenant's mappings with `listPlanMappings(tenantSlug, 'active')`, showing each name with its amount, currency, and interval.
- The page's form action takes the chosen `planMappingId` and calls `createCheckoutSession` with the scope `{ account: accountId }`. The `successUrl` and `cancelUrl` are `/_authstar/upgrade/success` and `/_authstar/upgrade/cancelled` on the request's own origin, the host the user came from. Keep passes both to Stripe unchecked, so web builds them and never takes them from the request. The action answers a 303 to Stripe's `url`.
- An empty list, a retired mapping, and a tenant with no Stripe configuration each render a plain message, not an error page.
- `success/+page.svelte` and `cancelled/+page.svelte` render a confirmation that says the user can close the tab and return to the application.

Update `web/TESTING.md`, which lists the page as not implemented.

It waits for T-0057, whose client method and fake the action and its specs call.

## Done when

- `web/spec/behavior/hosted-upgrade.spec.ts` covers these cases with the fake keep client:
  - the active list with price details
  - the redirect to sign-in without a session
  - the 303 to Stripe's URL, with the scope and both return URLs on the request's origin
  - each empty or error state
- `web/e2e/hosted-upgrade.spec.ts` covers the list, a choice, and the success and cancelled pages.
- `npm test` and `npm run check` in `web/` pass.

## Notes

Planned by planner-S-0007. `PlanMapping` in `web/src/lib/server/clients/keep.ts` already carries `unitAmount`, `currency`, and `interval`, so the page needs nothing from S-0008's stripe-prices route.
