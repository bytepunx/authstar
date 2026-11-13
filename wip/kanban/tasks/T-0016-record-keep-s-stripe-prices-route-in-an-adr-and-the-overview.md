---
id: T-0016
type: task
nature: feature
title: Record keep's stripe-prices route in an ADR and the overview
status: done
parent: S-0008
owner: bytepunx
created: 2026-11-06T17:46:45Z
updated: 2026-11-06T17:48:36Z
transitions:
  - to: ready
    at: 2026-11-06T17:48:07Z
    by: agent-S-0008
  - to: in-progress
    at: 2026-11-06T17:48:07Z
    by: agent-S-0008
  - to: done
    at: 2026-11-06T17:48:36Z
    by: agent-S-0008
stream: S-0008
tags: [keep, design]
touches: [design/adrs/README.md, design/system/overview.md]
usage:
  source: log
  seconds: 29
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 4
      output: 914
      cache_read: 566106
      cache_write: 11981
      cost: 0.2257
---
# T-0016 Record keep's stripe-prices route in an ADR and the overview

## Work

- Record the new contract between web and keep with `flai adr new --commit`, refining ADR-0041 (keep's API surface) and carrying out ADR-0046's call for a live price list: `GET /tenants/{tenantSlug}/stripe-prices`, gated by `billing:manage`, read-only, dialled with the tenant's own Stripe secret key.
- State the response shape: each active price with `id`, `productName`, `unitAmount`, `currency`, and `interval` (null for a one-off price). Only active prices whose product is active are listed, and every page is followed.
- State the failures: `409` when the tenant has no Stripe configuration, `502` when Stripe refuses or cannot be reached. Never log or return the key.
- Add the ADR's link to keep's row in `design/system/overview.md` § Parts.

## Done when

- The ADR exists, is listed in `design/adrs/README.md`, and names the route, its permission, its response fields, and its failures.
- Keep's row in `design/system/overview.md` links it.
- `flai check --strict` passes.

## Notes

`flai adr new --commit` adds the ADR file to the story's touches, so this task names only the index and the overview.
