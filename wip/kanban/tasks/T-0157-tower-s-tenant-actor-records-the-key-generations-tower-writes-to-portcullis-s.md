---
id: T-0157
type: task
nature: remediation
title: Tower's tenant actor records the key generations tower writes to portcullis's config
status: backlog
parent: S-0029
owner: bytepunx
created: 2026-11-14T10:09:57Z
updated: 2026-11-14T10:09:57Z
transitions: []
stream: S-0029
tags: [tower]
touches: [tower/src/actors/tenant_actor.ts, tower/src/routes/provisioning.ts, tower/spec/behavior/provisioning.spec.ts]
---
# T-0157 Tower's tenant actor records the key generations tower writes to portcullis's config

## Work

This task waits for no other task: it adds state that nothing reads yet.

Add to `tower/src/actors/tenant_actor.ts` a record of the key generations tower has written to portcullis's config for the tenant: per generations field (`sessionKeyGenerations`, `internalKeyGenerations`, `identityHashKeyGenerations`), the list of `{ version, effectiveFrom }` in the order tower appended them. Add a command and event that append one generation, and a command and event that remove the generations a prune took out. Default the record to empty lists, so tenants created before this change replay as having none recorded.

In `tower/src/routes/provisioning.ts`, when the tenant's full config goes to portcullis with `identityHashKeyGenerations: [{ version: 1, ... }]`, record that generation on the tenant after the patch succeeds. The narrow `_admin`-application patch, for a tenant portcullis already holds, writes no generation and records none.

Cover both paths in `tower/spec/behavior/provisioning.spec.ts`.

## Done when

- Provisioning a new tenant leaves identity-hash generation 1 in the tenant's record; registering a tenant portcullis already holds records nothing.
- The new events replay into the record, and a tenant with no such events has empty lists.
- `flai test` passes on the changed paths.

## Notes
