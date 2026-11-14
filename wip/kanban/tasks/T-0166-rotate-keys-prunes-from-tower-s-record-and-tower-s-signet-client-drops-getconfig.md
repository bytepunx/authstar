---
id: T-0166
type: task
nature: remediation
title: Rotate-keys prunes from tower's record, and tower's signet client drops getConfig
status: backlog
parent: S-0029
owner: bytepunx
created: 2026-11-14T10:10:15Z
updated: 2026-11-14T10:10:33Z
transitions: []
stream: S-0029
tags: [tower, signet]
touches: [tower/src/routes/rotate-keys.ts, tower/src/lib/signet-admin.ts, tower/spec/lib/fakes.ts, tower/spec/behavior/rotate-keys.spec.ts, tower/spec/behavior/signet-admin.spec.ts, tower/spec/behavior/provisioning.spec.ts, tower/TESTING.md]
after: [T-0157]
---
# T-0166 Rotate-keys prunes from tower's record, and tower's signet client drops getConfig

## Work

This task waits for T-0157, because it reads and writes the tenant's key-generation record that T-0157 adds, and both change `tower/spec/behavior/provisioning.spec.ts`.

`tower/src/routes/rotate-keys.ts` calls `signetAdmin.getConfig('portcullis')` in `pruneStaleGenerations`. Signet refuses it on the workload listener, the error is logged and swallowed, and no rotation ever prunes (I-0025). Change the route so that:

- each rotation records the generation it appended on the tenant, after its patch succeeds;
- the prune reads the tenant's record and retention (`cookie.maxAge` from the tenant actor, the fixed 300s for internal keys), and removes past-retention generations, never the current one, with a `test` and a `remove` per index in descending order, as now;
- a prune that signet accepts removes those generations from the record; one it rejects leaves the record alone and is logged, as now.

Judge a generation past retention by when the generation after it took effect (its `effectiveFrom`), not by its own `version`. Today's rule compares `version` with `now - retention`, treating the version as a Unix time. Provisioning writes identity-hash generation 1 with version 1, so once pruning works, the first identity-hash rotation would drop generation 1 at once, inside its retention window.

Remove `getConfig` from the `SignetAdmin` interface, `createSignetAdmin`, and `createNoopSignetAdmin` in `tower/src/lib/signet-admin.ts`, and correct the comments there and in rotate-keys that say tower can read portcullis's config. In `tower/spec/lib/fakes.ts`, drop `getConfig` and the `refuseGetConfig` option; assertions read the document with `peekConfig`. Update `provisioning.spec.ts`'s use of that option and the getConfig cases in `signet-admin.spec.ts`.

In `tower/spec/behavior/rotate-keys.spec.ts`, rewrite the prune cases to seed the tenant's record and the fake's document, and add the case that reproduces I-0025: with the fake standing in for a signet that cannot be read, a rotation prunes a stale generation tower recorded. Add a case where the document differs from the record and the prune fails without touching the record, and one where a rotation right after provisioning keeps identity-hash generation 1. Update the rotate-keys entry in `tower/TESTING.md`.

## Done when

- No tower source calls GetServiceConfig.
- A spec shows a rotation pruning a recorded stale generation with no config read.
- A spec shows a mismatched document leaving both the document and the record unchanged.
- A spec shows an identity-hash rotation right after provisioning keeping generation 1.
- `flai test` passes on the changed paths.

## Notes
