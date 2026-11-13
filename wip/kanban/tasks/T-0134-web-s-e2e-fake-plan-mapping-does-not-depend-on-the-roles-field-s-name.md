---
id: T-0134
type: task
nature: feature
title: Web's e2e fake plan mapping does not depend on the roles field's name
status: done
parent: S-0007
owner: alex
created: 2026-11-10T03:15:36Z
updated: 2026-11-10T03:21:09Z
transitions:
  - to: ready
    at: 2026-11-10T03:21:03Z
    by: agent-S-0007
  - to: in-progress
    at: 2026-11-10T03:21:03Z
    by: agent-S-0007
  - to: done
    at: 2026-11-10T03:21:09Z
    by: agent-S-0007
stream: S-0007
tags: []
touches: [web/spec/fixtures/fake-tower-server.ts]
usage:
  source: log
  seconds: 6
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 3
      output: 679
      cache_read: 292306
      cache_write: 7877
      cost: 0.1216
---

# T-0134 Web's e2e fake plan mapping does not depend on the roles field's name

## Work

T-0061 typed the e2e fake backend's plan mapping in `web/spec/fixtures/fake-tower-server.ts` as `Omit<PlanMapping, 'tenant'>`, so it names `grantedRoles`. S-0008's T-0133 renames web's `PlanMapping.grantedRoles` to `roles` (ADR-0108, MS-0009). Whichever story lands second would then fail `npm run check` without a textual conflict. The upgrade page reads no roles, so the fake's mapping leaves the field out and omits both names from its type.

It waits for no other task.

## Done when

- The fixture's type omits `tenant`, `grantedRoles`, and `roles`, and its mapping carries neither roles field.
- `npm run check` in `web/` passes, and `e2e/hosted-upgrade.spec.ts` still passes.

## Notes

Found from S-0008's correction on MS-0009.
