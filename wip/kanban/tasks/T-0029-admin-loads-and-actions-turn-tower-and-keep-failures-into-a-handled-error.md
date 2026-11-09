---
id: T-0029
type: task
nature: remediation
title: Admin loads and actions turn tower and keep failures into a handled error
status: done
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:49:11Z
updated: 2026-11-09T07:40:18Z
transitions:
  - to: ready
    at: 2026-11-09T07:17:18Z
    by: agent-S-0011
  - to: in-progress
    at: 2026-11-09T07:17:18Z
    by: agent-S-0011
  - to: done
    at: 2026-11-09T07:40:18Z
    by: agent-S-0011
stream: S-0011
tags: [web]
touches: [web/src/lib/server/upstream-error.ts, web/spec/behavior/upstream-error.spec.ts, web/src/routes/(admin)/applications/+page.server.ts, web/src/routes/(admin)/applications/new/+page.server.ts, "web/src/routes/(admin)/applications/[slug]/+page.server.ts", web/src/routes/(admin)/billing/organizations/+page.server.ts, "web/src/routes/(admin)/billing/organizations/[organizationId]/+page.server.ts", web/src/routes/(admin)/billing/plan-mappings/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.server.ts", web/src/routes/(admin)/billing/stripe-config/+page.server.ts, web/spec/behavior/applications-list.spec.ts, web/spec/behavior/applications-edit.spec.ts, web/spec/behavior/organizations-list.spec.ts, web/spec/behavior/organizations-detail.spec.ts, web/spec/behavior/billing-plan-mappings.spec.ts, web/spec/behavior/billing-stripe-config.spec.ts, web/spec/fixtures/fake-tower-client.ts, web/spec/fixtures/fake-keep-client.ts]
usage:
  source: log
  seconds: 1380
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 55
      output: 16750
      cache_read: 5091999
      cache_write: 70057
      cost: 1.8281
---
# T-0029 Admin loads and actions turn tower and keep failures into a handled error

## Work

- Add `web/src/lib/server/upstream-error.ts`. It turns a `TowerRequestError` or `KeepRequestError` into SvelteKit's `error()`:
  - A 5xx or unreachable upstream becomes 502 with a plain message naming the service.
  - A 404 stays 404.
  - Any other status is passed through with a plain message.
- The helper also gives actions the `fail(502, { formError })` shape they already use. Any other error is re-thrown as it is now. It logs once at this boundary, per `logging.md`: `component`, the service, the status, and `err`, never the response body.
- Apply it to every `(admin)` load and action that calls tower or keep:
  - The loads that have no handling today: applications list, applications new, organizations list, plan-mappings list, and stripe-config.
  - The try/catch blocks that re-throw everything but NotFound: `applications/[slug]` and `billing/organizations/[organizationId]`.
  - The actions that call a client outside a try: `applications/[slug]` delete and the usage-credential issue and revoke, `plan-mappings/[id]` retire, and the invite on `billing/organizations/[organizationId]`.
- Behavior tests:
  - `web/spec/behavior/upstream-error.spec.ts` covers the mapping.
  - One case per page in its existing spec, with the fake client throwing a 500. The load throws an `HttpError` with status 502, and the action returns `fail(502)`.

## Done when

- [ ] No `(admin)` load or action lets a tower or keep request error reach SvelteKit's default 500 handler.
- [ ] The new and changed behavior tests pass, through `flai test` once the test tiers are wired (I-0003), or else with `npm run test:behavior` in `web`.

## Notes

The thrown 502 renders on the error page from T-0028.
