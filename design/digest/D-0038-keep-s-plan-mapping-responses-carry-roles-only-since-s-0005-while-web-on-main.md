---
id: D-0038
title: Keep's plan-mapping responses carry roles only since S-0005, while web on main still reads grantedRoles from them
kind: decision
sources: [S-0005, T-0062, S-0008]
topics: [billing, keep, web, sveltekit]
paths: [keep/src/routes/plan-mappings.ts, keep/src/actors/plan_mapping_actor.ts, web/src/lib/server/clients/keep.ts, web/src/routes/(admin)/billing/plan-mappings]
date: 2026-11-13
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0038 Keep's plan-mapping responses carry roles only since S-0005, while web on main still reads grantedRoles from them

S-0005's T-0062 carried out ADR-0108's rename in keep: a plan mapping's roles are `roles`, and `grantedRoles` is tower's name for the set in effect. The narrative's Decisions record how far the rename goes:

- `plan_mapping_actor.ts` keeps a legacy read: "an event persisted before the rename carries `grantedRoles`, so it still replays."
- `routes/plan-mappings.ts` accepts `grantedRoles` on input as a deprecated alias until keep's next major release, with `roles` winning when a body sends both. Responses carry `roles` only, "as ADR-0108 says". `toResponse()` there "is the one place an output alias would go."
- The coupons' and trials' own `grantedRoles` fields stay: ADR-0108 renames only the plan mapping's field.

The gap this leaves: web still reads `grantedRoles` from keep's plan mappings (`web/src/lib/server/clients/keep.ts` and `web/src/routes/(admin)/billing/plan-mappings/[id]/+page.svelte`, on main and on `story/S-0008`). S-0005 asked S-0008 on MS-0019 whether it switches web to `roles`, and did not wait for the answer. Until web switches, or keep adds an output alias in `toResponse()`, web's plan-mapping screens read no roles from keep.

Source: S-0005 (narrative, Decisions), T-0062; S-0008 is the story asked to switch web.
