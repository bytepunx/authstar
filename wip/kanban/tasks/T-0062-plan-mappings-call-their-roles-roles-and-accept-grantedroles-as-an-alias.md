---
id: T-0062
type: task
nature: remediation
title: Plan mappings call their roles roles and accept grantedRoles as an alias
status: backlog
parent: S-0005
owner: bytepunx
created: 2026-11-06T18:09:50Z
updated: 2026-11-06T18:09:50Z
transitions: []
stream: S-0005
tags: [keep, billing]
touches: [keep/src/actors/plan_mapping_actor.ts, keep/src/routes/plan-mappings.ts, keep/src/routes/webhooks.ts, keep/src/lib/entitlement-publisher.ts, keep/spec/behavior/plan-mappings.spec.ts, keep/spec/integration/plan-mappings.integration.spec.ts, docs/users/index.md]
---
# T-0062 Plan mappings call their roles roles and accept grantedRoles as an alias

## Work

Carry ADR-0108 (digest D-0003) in keep. Rename `planMapping.grantedRoles` to `roles` in `plan_mapping_actor.ts`. In `routes/plan-mappings.ts`, accept `grantedRoles` on input as a deprecated alias for `roles`, and always return `roles`. Read `roles` everywhere `webhooks.ts` reads a mapping's roles. The `entitlement.converted-to-paid` envelope, typed in `entitlement-publisher.ts`, carries `roles`. In `docs/users/index.md`, say that a role a plan grants is removed on degrade, even when an admin granted it as well.

Waits for nothing. It is first on `webhooks.ts`, so the later tasks rebase on the rename, not the other way round. Web's form is S-0008's, as ADR-0108 says. Leave `web/` alone.

## Done when

- A plan mapping created or updated with `grantedRoles` alone stores the list as `roles`, and every response carries `roles` and no `grantedRoles`; behavior tests in `keep/spec/behavior/plan-mappings.spec.ts` assert both
- `grep -rn grantedRoles keep/src` finds only the input alias in `routes/plan-mappings.ts`
- Keep's behavior and integration tests pass

## Notes
