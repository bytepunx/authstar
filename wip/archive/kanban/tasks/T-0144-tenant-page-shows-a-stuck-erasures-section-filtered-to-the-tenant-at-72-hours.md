---
id: T-0144
type: task
nature: feature
title: Tenant page shows a Stuck Erasures section filtered to the tenant at 72 hours
status: done
parent: S-0013
owner: alex
created: 2026-11-14T09:56:31Z
updated: 2026-11-14T10:08:36Z
transitions:
  - to: ready
    at: 2026-11-14T10:06:46Z
    by: agent-S-0013
  - to: in-progress
    at: 2026-11-14T10:06:46Z
    by: agent-S-0013
  - to: done
    at: 2026-11-14T10:08:36Z
    by: agent-S-0013
stream: S-0013
tags: []
touches: ["steward/src/routes/tenants/[slug]/+page.svelte", steward/tests/e2e/tenant-stuck-erasures.spec.ts]
after: [T-0143, T-0047]
usage:
  source: log
  seconds: 110
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 12
      output: 1687
      cache_read: 965146
      cache_write: 8055
      cost: 0.2874
---

# T-0144 Tenant page shows a Stuck Erasures section filtered to the tenant at 72 hours

## Work

## Done when

## Notes
