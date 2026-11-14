---
id: T-0138
type: task
nature: remediation
title: Tower's portcullis registration does not read portcullis's config, which signet refuses on the workload listener
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-13T22:23:20Z
updated: 2026-11-13T22:23:32Z
transitions:
  - to: ready
    at: 2026-11-13T22:23:27Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-13T22:23:27Z
    by: agent-S-0017
  - to: done
    at: 2026-11-13T22:23:32Z
    by: agent-S-0017
stream: S-0017
tags: []
touches: [tower/src/routes/provisioning.ts, tower/spec/behavior/provisioning.spec.ts, tower/spec/lib/fakes.ts, design/stories/tower/012-tenant-creation-and-provisioning.md]
usage:
  source: log
  seconds: 5
  estimated: true
  priced_by: harness
  models: []
---
# T-0138 Tower's portcullis registration does not read portcullis's config, which signet refuses on the workload listener

## Work

Found live on s-0017 at c4b9e1e: T-0137's `getConfig('portcullis')` failed with `7 PERMISSION_DENIED: /admin.v1.GitOpsService/GetServiceConfig is only reachable via the admin listener, not the workload listener`. `POST /tenants` with a domain answered 500, so no `_admin` was registered and no first-admin invite was issued. The report read through portcullis answered 403 for the missing `analytics:read`.

- `tower/src/routes/provisioning.ts`: add `_admin` at `/tenants/<slug>/applications/_admin` first. When signet rejects that patch for any reason but transport or auth (gRPC 1, 4, 7, 14, 16), add the whole tenant at `/tenants/<slug>`. Never read the config.
- `tower/spec/lib/fakes.ts`: options for RFC 6902 adds (a missing parent rejects the patch), a refused `getConfig`, and seed documents. A patch is recorded only when it applies, and `peekConfig` reads the document.
- `tower/spec/behavior/provisioning.spec.ts`: the provisioning app uses those options. A new test covers an unreachable signet, which must not fall back to replacing the tenant.
- `design/stories/tower/012-tenant-creation-and-provisioning.md`: says the same.

## Done when

- `flai test` on the paths passes, and the spec fails against T-0137's `provisioning.ts`.

## Notes

`flai test` passed (test tier, 6m3s). With a81f880's `provisioning.ts`, `provisioning.spec.ts` fails 9 of 20 tests on the refused `getConfig`.
