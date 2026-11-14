---
id: TH-0054
title: "Plan for S-0026: four tasks in three layers, usage-updated scoped per account"
anchor:
  path: wip/kanban/stories/S-0026-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md
  item: S-0026
status: open
participants: [planner-S-0026]
created: 2026-11-14T10:10:21Z
updated: 2026-11-14T10:10:21Z
---

# TH-0054 Plan for S-0026: four tasks in three layers, usage-updated scoped per account

On wip/kanban/stories/S-0026-keep-s-usage-updated-event-still-carries-the-retired-tenant-scope.md.

## Entries

### 2026-11-14T10:10:21Z planner-S-0026
S-0026 has four draft tasks in three layers. Its touches, forecast, and cost of delay are written. The reasons are under `### Planning` in its Notes.

## Tasks and layers

| Layer | Task | Waits for | Touches |
|-------|------|-----------|---------|
| 1 | T-0146: an ADR proposes the fix | none | a new ADR, `design/adrs/README.md`, design stories keep/001 and keep/005 |
| 2 | T-0147: usage-updated becomes `{account: accountId}` with that account's total, and `UsageScope` goes | T-0146 | `keep/src/routes/usage.ts`, the usage record actor, the entitlement publisher, the sequence provider, and their specs |
| 2 | T-0148: `GET /tenants/{tenantSlug}/customer` is removed, and the billing-reads specs seed `{account}` and `{organization}` only | T-0146 | `keep/src/routes/billing-reads.ts`, its spec, `keep/TESTING.md` |
| 3 | T-0149: close I-0021 | T-0147, T-0148 | the I-0021 file, `design/issues/summary.md` |

T-0147 and T-0148 share no path, so they can run together.

## Figures

- Forecast: 1h, delivery 2026-11-16T23:30Z. flai said 23m. I raised it because the story holds an ADR, and its close-out runs keep's tiers and a kluster deploy.
- Cost of delay: 37.50 USD a week, from flai's input of 15m per cycle. It stands as flai worked it out.

## Assumptions

1. The proposed fix is that `periodUsage` totals per account, not per tenant. ADR-0043 materialises the event into tower's `account.usage`, which goes on that account's token, so a tenant-wide total there is wrong. Every usage record already carries a required `accountId`. If you would rather keep stop publishing the event until tower has a consumer, T-0146 and T-0147 change to that.
2. The issue's two other ADR-0109 leftovers are in scope: the tenant customer route and the `{tenant}` seeds in the billing-reads spec. That is T-0148. No caller of the route was found in web, steward, or portcullis. I would drop T-0148 into a story of its own only if you want I-0021 to cover the usage event alone.
3. Tower needs no change, because it has no consumer for usage-updated.
4. The ADR number 0113 is a guess. T-0146 takes the next free number.

## Note

The run was asked to read a thread named "asked". No such thread exists, and S-0026 had no earlier plan thread or tasks, so I planned it fresh.

I have no split, merge, or drop to propose.
