---
id: T-0148
type: task
nature: remediation
title: Keep drops the tenant-scoped customer read and its specs seed account and organization records only
status: backlog
parent: S-0026
owner: bytepunx
created: 2026-11-14T10:09:29Z
updated: 2026-11-14T10:09:29Z
transitions: []
stream: S-0026
tags: [keep]
touches: [keep/src/routes/billing-reads.ts, keep/spec/behavior/billing-reads.spec.ts, keep/TESTING.md]
after: [T-0146]
---
# T-0148 Keep drops the tenant-scoped customer read and its specs seed account and organization records only

## Work

This task waits for T-0146, because it removes the route that T-0146's ADR retires.

`keep/src/routes/billing-reads.ts` serves `GET /tenants/{tenantSlug}/customer`. It looks for a `{tenant}`-scoped customer, and no write path creates one since ADR-0109. Remove the route. Keep `GET /tenants/{tenantSlug}/accounts/{accountId}/customer`.

In `keep/spec/behavior/billing-reads.spec.ts`, seed the customer, refund, and dispute records with `{account}` or `{organization}` scopes instead of `{tenant}`. Add a case showing that the removed route now answers 404. Update the billing-reads entry in `keep/TESTING.md`.

Leave `keep/src/report-tenant-scope.ts` and its spec alone. They are ADR-0109's one-off report, and the refusal specs in trials and checkout sessions are meant to send `{tenant}`.

This task shares no path with T-0147, so the two can run together.

## Done when

- `GET /tenants/{tenantSlug}/customer` is gone, and a spec shows it answers 404.
- No billing-reads spec seeds a `{tenant}` scope.
- `keep/TESTING.md` describes the billing-reads specs as they now stand.
- `flai test` passes on the changed paths.

## Notes
