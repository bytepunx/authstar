---
id: T-0064
type: task
nature: remediation
title: Tenant stripe-config holds paymentFailureAttempts, default 3
status: done
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:09:55Z
updated: 2026-11-10T03:26:40Z
transitions:
  - to: ready
    at: 2026-11-10T03:12:23Z
    by: agent-S-0005
  - to: in-progress
    at: 2026-11-10T03:12:23Z
    by: agent-S-0005
  - to: done
    at: 2026-11-10T03:26:40Z
    by: agent-S-0005
stream: S-0005
tags: [keep, billing]
touches: [keep/src/lib/stripe-config.ts, keep/src/routes/stripe-config.ts, keep/src/lib/signet-stripe-config-store.ts, keep/spec/behavior/stripe-config.spec.ts, keep/spec/behavior/signet-stripe-config-store.spec.ts]
usage:
  source: log
  seconds: 857
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 31
      output: 12332
      cache_read: 3841044
      cache_write: 167643
      cost: 1.9198
---
# T-0064 Tenant stripe-config holds paymentFailureAttempts, default 3

## Work

Add the tenant setting ADR-0107 (digest D-0002) names: `paymentFailureAttempts`, an integer of 1 or more, default `3`. `TenantStripeConfig` in `lib/stripe-config.ts` carries it. The PATCH schema in `routes/stripe-config.ts` accepts it, and the GET returns it. Its `additionalProperties: false` refuses the field today.

The signet store in `lib/signet-stripe-config-store.ts` holds secrets only, and this setting is not a secret. Store it beside them as a non-secret value, or in a store of its own. Record the choice, and why, in the narrative's `## Decisions`.

Waits for nothing. Its files are its own, so it runs with the roles rename.

## Done when

- PATCH with `paymentFailureAttempts: 1` stores it, and GET returns it; a tenant that never set it reads `3`; `0` or a non-integer is refused with 400; behavior tests in `keep/spec/behavior/stripe-config.spec.ts` assert each
- The stored value survives a reload of the config store; `keep/spec/behavior/signet-stripe-config-store.spec.ts` asserts it
- Keep's behavior tests pass

## Notes
