---
id: I-0021
title: keep's usage-updated event still carries the retired tenant scope
class: defect
status: open
count: 1
cost: 15m
first_reported: 2026-11-10T03:45:55Z
last_reported: 2026-11-10T03:45:55Z
updated: 2026-11-10T03:45:55Z
---

# I-0021 keep's usage-updated event still carries the retired tenant scope

## Description
keep's usage-updated event still carries the retired tenant scope

## Instances

### 2026-11-10T03:45:55Z
Story: S-0005.
S-0005's T-0070 retired `{tenant}` from keep's entitlement events (ADR-0109). `keep/src/routes/usage.ts` still publishes `entitlement.usage-updated` with `scope: {tenant}`, carrying a running total summed over every account for the tenant, application, and meter (ADR-0043). Tower has no consumer for the event today. Moving it to `{account: accountId}` changes what the total means, which is a metering decision beyond S-0005's webhook criteria. So S-0005 kept it, typed apart as `UsageScope` in `keep/src/lib/entitlement-publisher.ts`. No other event type admits `{tenant}`. Two more ADR-0109 leftovers are outside S-0005's touches. `GET /tenants/:tenantSlug/customer` in `keep/src/routes/billing-reads.ts` still looks up a `{tenant}`-scoped customer, which no write path creates any more. `keep/spec/behavior/billing-reads.spec.ts` still seeds `{tenant}` records.

## Remediation
