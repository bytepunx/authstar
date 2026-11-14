---
id: T-0047
type: task
nature: feature
title: Tenant page shows an Activity section with loading, empty, and error states
status: done
parent: S-0013
owner: bytepunx
created: 2026-11-06T18:08:18Z
updated: 2026-11-09T21:20:54Z
transitions:
  - to: ready
    at: 2026-11-09T21:08:00Z
    by: agent-S-0013
  - to: in-progress
    at: 2026-11-09T21:08:00Z
    by: agent-S-0013
  - to: done
    at: 2026-11-09T21:20:54Z
    by: agent-S-0013
stream: S-0013
tags: [steward]
touches: ["steward/src/routes/tenants/[slug]/+page.svelte", steward/tests/e2e/tenant-activity.spec.ts, steward/tests/behavior/activity.spec.ts, steward/tests/helpers/fake-backend-server.ts, steward/tests/integration/api-wire.integration.spec.ts]
after: [T-0045]
usage:
  source: log
  seconds: 774
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 37
      output: 8548
      cache_read: 2501208
      cache_write: 147568
      cost: 1.7211
---
# T-0047 Tenant page shows an Activity section with loading, empty, and error states

## Work

This task waits for T-0045, because the section calls the `/api/tenants/[slug]/activity` route T-0045 adds. The e2e tests run against the fake tower seeded in T-0044.

- In `steward/src/routes/tenants/[slug]/+page.svelte`, add an Activity section after Role Definitions. Follow the page's existing sections: a `loadActivity()` started from `onMount` that calls `apiCall`, with `activityLoading` and `activityError` state.
  - Loading: `<p>Loading...</p>`.
  - Error: `<p class="error" role="alert">`.
  - Empty: an `{:else}` item, `No activity yet.`
- Show the first page, tower's default of 50 entries, newest first as tower orders them. Each entry shows `timestamp`, `actorType`, `actorId`, `eventType`, and `summary`. When `actingAs` is present, label it as self-reported, per ADR-0048 and `design/stories/steward/004-activity-and-stuck-erasure-requests.md`. When `actingAs` is absent, show nothing for it.
- Add `steward/tests/e2e/tenant-activity.spec.ts`, connecting as the `Tenant Operator Context` block of `steward/tests/e2e/operator-console.spec.ts` does. It covers:
  - `acme`'s seeded entries, with the self-reported label on the entry that has one and none on the other
  - `globex`'s empty state
  - the error state, by fulfilling the activity request with a 502 through `page.route`
  - the loading state, by holding the activity request with `page.route` until the test has seen it

## Done when

- [ ] `/tenants/acme` lists the fake tower's activity, and labels `actingAs` as self-reported.
- [ ] The section shows its loading, empty, and error states in the page's existing markup.
- [ ] `npm run test:e2e` passes in `steward`, run through `flai test` when a tier covers steward.

## Notes

Story 004 asks for a recent-activity view and says nothing of paging, so the section shows one page. Its "view all" paging is left to a later story.
