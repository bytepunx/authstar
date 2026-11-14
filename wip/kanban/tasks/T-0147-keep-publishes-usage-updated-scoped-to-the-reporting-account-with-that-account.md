---
id: T-0147
type: task
nature: remediation
title: Keep publishes usage-updated scoped to the reporting account with that account's running total
status: backlog
parent: S-0026
owner: bytepunx
created: 2026-11-14T10:09:23Z
updated: 2026-11-14T10:09:23Z
transitions: []
stream: S-0026
tags: [keep]
touches: [keep/src/routes/usage.ts, keep/src/actors/usage_record_actor.ts, keep/src/lib/entitlement-publisher.ts, keep/src/lib/consequent-sequence-provider.ts, keep/spec/behavior/usage.spec.ts, keep/spec/behavior/consequent-sequence-provider.spec.ts]
after: [T-0146]
---
# T-0147 Keep publishes usage-updated scoped to the reporting account with that account's running total

## Work

This task waits for T-0146, because it builds the scope and total that T-0146's ADR decides.

In `keep/src/routes/usage.ts`, `POST /tenants/{tenantSlug}/usage-records` publishes `entitlement.usage-updated` with `scope: {tenant}`. Change it to `scope: {account: body.accountId}`. Sum `periodUsage` over the usage records of that tenant, application, meter, and account only. Take the sequence for the account scope, not the tenant scope. Add `accountId` to `searchableBy` in `keep/src/actors/usage_record_actor.ts` so the sum is a search, not a filter in memory.

Then remove `UsageScope` from `keep/src/lib/entitlement-publisher.ts`. The usage event takes `EntitlementScope`, and `scopeKey` loses its tenant branch. Have `keep/src/lib/consequent-sequence-provider.ts` take `EntitlementScope` too. After this, no `entitlement.*` event type admits `{tenant}`.

Write the reproducing test first in `keep/spec/behavior/usage.spec.ts`. Two accounts of one tenant report on the same meter. Each publish carries its own account's scope and total, and no publish carries `{tenant}`. The test fails on the current code. Bring the sequence provider's spec into line with the narrowed type.

## Done when

- `entitlement.usage-updated` carries `scope: {account: accountId}` and that account's running total.
- The new spec in `keep/spec/behavior/usage.spec.ts` fails before the change and passes after it.
- `UsageScope` is gone, and keep's type check fails if any entitlement event is given `{tenant}`.
- `flai test` passes on the changed paths.

## Notes
