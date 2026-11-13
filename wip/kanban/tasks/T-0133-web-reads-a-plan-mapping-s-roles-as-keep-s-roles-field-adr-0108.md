---
id: T-0133
type: task
nature: feature
title: Web reads a plan mapping's roles as keep's roles field (ADR-0108)
status: done
parent: S-0008
owner: alex
created: 2026-11-10T03:14:28Z
updated: 2026-11-10T03:18:37Z
transitions:
  - to: ready
    at: 2026-11-10T03:14:46Z
    by: agent-S-0008
  - to: in-progress
    at: 2026-11-10T03:14:46Z
    by: agent-S-0008
  - to: done
    at: 2026-11-10T03:18:37Z
    by: agent-S-0008
stream: S-0008
tags: [web]
touches: [web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/+page.svelte, "web/src/routes/(admin)/billing/plan-mappings/[id]/+page.svelte", web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/spec/behavior/billing-plan-mappings.spec.ts, docs/users/index.md]
usage:
  source: log
  seconds: 231
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 62
      output: 13968
      cache_read: 8646667
      cache_write: 182993
      cost: 3.4468
---
# T-0133 Web reads a plan mapping's roles as keep's roles field (ADR-0108)

## Work

- ADR-0108 renames keep's `planMapping.grantedRoles` to `roles` and says the web form follows in S-0008. S-0005 carries keep: it returns only `roles` and accepts `grantedRoles` on input as a deprecated alias.
- In `web/src/lib/server/clients/keep.ts`, `PlanMapping` carries `roles: GrantedRole[]`. Every plan mapping keep returns (list, get, create, update) is normalized in one function to `roles: raw.roles ?? raw.grantedRoles ?? []`, with a comment naming ADR-0108 and when to drop the fallback. Writes (`PlanMappingInput`, `PlanMappingUpdate`) keep sending `grantedRoles`, which both today's keep and S-0005's keep accept.
- The list page and the edit page read `mapping.roles`. The fake keep client returns `roles`.
- The new and edit forms show ADR-0108's note beside the roles field: a plan's roles are removed when its subscription lapses, even if an admin granted the same role; give a role that must survive non-payment a name no plan uses.
- `docs/users/index.md`'s Plan mappings section says the same in one sentence.
- Specs in `web/spec/behavior/billing-plan-mappings.spec.ts`: the client maps a response with only `roles`, and one with only `grantedRoles`; the list and edit loads expose `roles`.

## Done when

- `flai test` on the changed web paths passes, and web's svelte-check is clean.

## Notes

The fallback and the write alias let S-0008 and S-0005 be accepted in either order (MS-0019). A follow-up after both land switches writes to `roles` and drops the fallback.
