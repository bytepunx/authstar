---
id: T-0009
type: task
nature: research
title: "ADR: one meaning for granted roles across keep and tower"
status: done
parent: S-0004
owner: alex
created: 2026-10-21T05:26:18Z
updated: 2026-10-21T05:28:41Z
transitions:
  - to: ready
    at: 2026-10-21T05:28:41Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:28:41Z
    by: claude
  - to: done
    at: 2026-10-21T05:28:41Z
    by: claude
stream: S-0004
tags: []
touches: [design/adrs]
---
# T-0009 ADR: one meaning for granted roles across keep and tower

## Work

Write the ADR that names what a plan mapping's roles are called in keep and in the `entitlement.*` envelope, so they are never confused with tower's `account.grantedRoles` baseline (ADR-0018), and says how a role that is both plan-granted and admin-granted behaves on degrade.

## Done when

- The ADR is accepted, indexed, refines ADR-0018 and ADR-0038, and names the fields S-0005 renames.

## Notes

`keep/src/actors/plan_mapping_actor.ts` stores `grantedRoles`; tower's `account.grantedRoles` is the set that survives trial expiry and non-payment.
