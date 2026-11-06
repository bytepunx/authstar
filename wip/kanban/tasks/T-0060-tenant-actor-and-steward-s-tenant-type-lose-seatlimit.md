---
id: T-0060
type: task
nature: remediation
title: Tenant actor and steward's Tenant type lose seatLimit
status: backlog
parent: S-0014
owner: bytepunx
created: 2026-11-06T18:09:46Z
updated: 2026-11-06T18:09:46Z
transitions: []
stream: S-0014
tags: [tower, steward]
touches: [tower/src/actors/tenant_actor.ts, tower/spec/behavior/tenants.spec.ts, steward/src/lib/types.ts]
after: [T-0058]
---
# T-0060 Tenant actor and steward's Tenant type lose seatLimit

## Work

Remove the tenant seat limit, as ADR-0109 decides.

- In `tower/src/actors/tenant_actor.ts`, remove the `seatLimit` state field and its default, the `SetSeatLimitCommand` interface, the `setSeatLimit` command and its `'set-seat-limit'` registration, the `seatLimitSet` reducer and its `'seat-limit-set'` registration, and the `created` handler's `seatLimit = null`.
- `GET` and `PATCH /tenants/:tenantSlug` return the whole state through `toResponse`, so the field leaves both responses. In `tower/spec/behavior/tenants.spec.ts`, add an assertion that neither response has `seatLimit`.
- In `steward/src/lib/types.ts`, remove `seatLimit` from `Tenant`. Nothing in steward reads it.
- Grep `tower/src/routes`, `clients/typescript`, `web/src`, and `steward/src` for a tenant `seatLimit`, `set-seat-limit`, or `seat-limit-set`. The organization's seat limit stays. Note in this task what the grep found.

It waits for T-0058, which removes the consumer's call to `tenant.set-seat-limit`. Removing the command first would break tower's build and the consumer's tests.

## Done when

- `tenant_actor.ts` has no `seatLimit`, `set-seat-limit`, or `seat-limit-set`.
- No tower route, `clients/typescript` type, or steward type references a tenant seat limit.
- `flai test tower/src/actors/tenant_actor.ts steward/src/lib/types.ts` passes.

## Notes
