---
id: T-0051
type: task
nature: feature
title: Keep lets an account of the tenant list its active plan mappings
status: done
parent: S-0007
owner: bytepunx
created: 2026-11-06T18:08:59Z
updated: 2026-11-09T21:00:57Z
transitions:
  - to: ready
    at: 2026-11-09T20:46:15Z
    by: agent-S-0007
  - to: in-progress
    at: 2026-11-09T20:46:15Z
    by: agent-S-0007
  - to: done
    at: 2026-11-09T21:00:57Z
    by: agent-S-0007
stream: S-0007
tags: [keep]
touches: [keep/src/routes/plan-mappings.ts, keep/spec/behavior/plan-mappings.spec.ts, design/adrs/README.md, design/adrs/0112-any-signed-in-caller-of-a-tenant-may-list-its-active-plan-mappings-every-other.md]
usage:
  source: log
  seconds: 882
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 36
      output: 10515
      cache_read: 3507970
      cache_write: 109748
      cost: 1.5371
---
# T-0051 Keep lets an account of the tenant list its active plan mappings

## Work

`GET /tenants/{tenantSlug}/plan-mappings` requires `billing:manage` (`keep/src/routes/plan-mappings.ts`). So a plain account on the upgrade page cannot list the plans it may buy, although `POST /tenants/{tenantSlug}/checkout-sessions` already lets it check out for its own `account` scope. Let any caller whose internal JWT names the route's tenant list the mappings with `status=active`. Every other status, and every write, still requires `billing:manage`.

Record the change in a new ADR with `flai adr new`, refining ADR-0041 and ADR-0065, and add it to `design/adrs/README.md`. ADR-0065 says the page reads this route, but not who may read it. I-0005 records that keep does not compare the token's tenant with the route's tenant. Compare them here for the relaxed read.

This task waits for no other task.

## Done when

- A behavior case in `keep/spec/behavior/plan-mappings.spec.ts` shows an account without `billing:manage` listing active mappings, with their amount, currency, and interval.
- Further cases show the same caller refused (403) for another status, for no status filter, and for another tenant's slug.
- The ADR is accepted and listed in `design/adrs/README.md`, and the task's touches name its file.

## Notes

Planned by planner-S-0007. The ADR's file name is unknown until `flai adr new` writes it. `flai task done` widens the touches with it.
