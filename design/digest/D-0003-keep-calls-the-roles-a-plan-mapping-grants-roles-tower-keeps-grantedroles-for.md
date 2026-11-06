---
id: D-0003
title: "Keep calls the roles a plan mapping grants roles; tower keeps grantedRoles for an account's or organization's set of roles in effect"
kind: decision
sources: [S-0004]
topics: [billing, keep, tower]
paths: [keep/src/actors/plan_mapping_actor.ts, keep/src/routes/plan-mappings.ts, web/src/routes/(admin)/billing/plan-mappings, design/adrs/0108-plan-mappings-grant-roles-granted-roles-is-tower-s-set-in-effect.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0003 Keep calls the roles a plan mapping grants roles; tower keeps grantedRoles for an account's or organization's set of roles in effect

S-0004 settled a naming clash, recorded in its narrative's Decisions: "Naming: keep renames, tower keeps `grantedRoles` (ADR-0108), because tower's field is in the enrichment contract and the SDKs."

`planMapping.roles` replaces `planMapping.grantedRoles` in keep's actor, HTTP API, and web form; keep accepts `grantedRoles` on input as a deprecated alias until its next major release and always returns `roles`. Degrade means keep revokes each of the plan's `roles` and tower removes them from `grantedRoles`; everything else survives. A role that is both plan-granted and admin-granted is removed on degrade, since tower's sets carry no provenance.

ADR-0108 states this, but it is on `story/S-0004`, not yet on `main` (I-0004). S-0005 carries keep; S-0008 the web form.
