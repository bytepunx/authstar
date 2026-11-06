---
id: T-0070
type: task
nature: remediation
title: Keep refuses the tenant scope and publishes no event with it
status: backlog
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:10:05Z
updated: 2026-11-06T18:10:05Z
transitions: []
stream: S-0005
tags: [keep, billing]
touches: [keep/src/lib/scope.ts, keep/src/actors/customer_actor.ts, keep/src/actors/subscription_actor.ts, keep/src/actors/dispute_actor.ts, keep/src/actors/plan_mapping_actor.ts, keep/src/actors/trial_actor.ts, keep/src/actors/refund_actor.ts, keep/src/routes/checkout-sessions.ts, keep/src/routes/trials.ts, keep/src/routes/coupons.ts, keep/src/routes/plan-mappings.ts, keep/src/routes/webhooks.ts, keep/src/report-tenant-scope.ts, keep/package.json, keep/spec/behavior/checkout-sessions.spec.ts, keep/spec/behavior/trials.spec.ts, keep/spec/behavior/coupons.spec.ts, keep/spec/behavior/webhooks.spec.ts, keep/spec/behavior/report-tenant-scope.spec.ts]
after: [T-0062]
---
# T-0070 Keep refuses the tenant scope and publishes no event with it

## Work

Carry ADR-0109 (digest D-0004) in keep. `Scope` in `lib/scope.ts` becomes `{account} | {organization}`, and every actor's own scope type becomes that one type. That retires the casts that write organizations into `{account} | {tenant}` types today. A checkout session, trial, coupon, or plan mapping with a `{tenant}` scope is refused with a 400 that says so. In `webhooks.ts`, `readScope` no longer falls back to `{tenant}`, and no event with a tenant scope is published.

Add the one-off report the ADR asks for, `keep/src/report-tenant-scope.ts`. It lists the records in keep's store that have a `{tenant}` scope and changes none of them. Run it with a `keep/package.json` script, following `keep/src/sync-pricing.ts` as the pattern for an entrypoint.

Waits for T-0062: both change `plan_mapping_actor.ts`, `routes/plan-mappings.ts`, and `webhooks.ts`.

## Done when

- `POST` checkout-sessions and trials with `{tenant}` scope answer 400 naming the scope; behavior tests in `checkout-sessions.spec.ts` and `trials.spec.ts` assert it, and in `coupons.spec.ts` wherever a coupon takes a scope
- No webhook test publishes an event whose scope has no account or organization id
- `keep/spec/behavior/report-tenant-scope.spec.ts` seeds one tenant-scoped and one account-scoped record, and asserts the report lists only the first and leaves both unchanged
- `tsc` and keep's behavior tests pass

## Notes
