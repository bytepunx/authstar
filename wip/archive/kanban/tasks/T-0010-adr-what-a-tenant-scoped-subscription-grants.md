---
id: T-0010
type: task
nature: research
title: "ADR: what a tenant-scoped subscription grants"
status: done
parent: S-0004
owner: alex
created: 2026-10-21T05:26:19Z
updated: 2026-10-21T05:28:42Z
transitions:
  - to: ready
    at: 2026-10-21T05:28:41Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:28:41Z
    by: claude
  - to: done
    at: 2026-10-21T05:28:42Z
    by: claude
stream: S-0004
tags: []
touches: [design/adrs]
---
# T-0010 ADR: what a tenant-scoped subscription grants

## Work

Write the ADR that decides whether `{tenant}`-scoped subscriptions exist, and if so what tower materializes from their role grants, given that tower's consumer drops a role grant with no account or organization.

## Done when

- The ADR is accepted and indexed, and either names the tower command S-0005 adds or records that tenant-scoped plans grant seat limits only.

## Notes

`tower/src/lib/entitlement-consumer.ts` returns early for `role-granted` without an account or organization id; ADR-0042 (superseded) and ADR-0046 define who the customer is.
