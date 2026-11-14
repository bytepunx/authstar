---
id: T-0143
type: task
nature: feature
title: Top-level Stuck Erasures view at /erasure-requests/stuck with threshold input and rows grouped by outstanding service
status: done
parent: S-0013
owner: alex
created: 2026-11-14T09:56:27Z
updated: 2026-11-14T09:59:23Z
transitions:
  - to: ready
    at: 2026-11-14T09:56:35Z
    by: agent-S-0013
  - to: in-progress
    at: 2026-11-14T09:56:35Z
    by: agent-S-0013
  - to: done
    at: 2026-11-14T09:59:23Z
    by: agent-S-0013
stream: S-0013
tags: []
touches: [steward/src/routes/erasure-requests/stuck/+page.svelte, steward/src/lib/components/StuckErasureRows.svelte, steward/src/routes/+layout.svelte, steward/tests/e2e/stuck-erasure-requests.spec.ts, steward/tests/helpers/fake-backend-server.ts]
after: [T-0046]
usage:
  source: log
  seconds: 168
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 21
      output: 2945
      cache_read: 1685476
      cache_write: 14067
      cost: 0.5019
---

# T-0143 Top-level Stuck Erasures view at /erasure-requests/stuck with threshold input and rows grouped by outstanding service

## Work

## Done when

## Notes
