---
id: T-0137
type: task
nature: remediation
title: Tower's portcullis registration adds only _admin to a tenant portcullis already configures
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-13T21:45:36Z
updated: 2026-11-13T21:57:56Z
transitions:
  - to: ready
    at: 2026-11-13T21:45:42Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-13T21:45:42Z
    by: agent-S-0017
  - to: done
    at: 2026-11-13T21:57:56Z
    by: agent-S-0017
stream: S-0017
tags: []
touches: [tower/src/routes/provisioning.ts, tower/spec/behavior/provisioning.spec.ts, design/stories/tower/012-tenant-creation-and-provisioning.md]
usage:
  source: log
  seconds: 734
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 63
      output: 22385
      cache_read: 8288456
      cache_write: 162811
      cost: 3.0843
---
# T-0137 Tower's portcullis registration adds only _admin to a tenant portcullis already configures

## Work

Criterion 2 and 4's precondition, as the operator chose on TH-0047 (option 1).

- `tower/src/routes/provisioning.ts`, `completeDomainDependentProvisioning`: before the patch, read portcullis's config with `app.signetAdmin.getConfig('portcullis')`. When `tenants.<slug>` already exists there, patch only `add /tenants/<slug>/applications/_admin` with the application object tower writes today, and leave the tenant's cookie, jwt, providers, key generations, and other applications as they are. When it does not exist, or there is no config yet (`null`), add the whole tenant as today. `portcullisRegistered` is marked either way.
- `tower/spec/behavior/provisioning.spec.ts`: a test that fails without the change. Seed the fake signet admin (`tower/spec/lib/fakes.ts`, which round-trips getConfig/patchConfig) with a portcullis config holding the tenant with another application. Set the domain with `POST /tenants` and with `PATCH /tenants/:slug/domain`. Assert that the other application and the tenant's cookie survive and `_admin` is added. The existing whole-tenant case stays covered.
- `design/stories/tower/012-tenant-creation-and-provisioning.md`: says what registration does for a tenant portcullis already configures.

Runs in layer 1 beside nothing else open; T-0110 waits for it, since the golden path's one-run pass needs it.

## Done when

- `flai test` on `tower/` passes with the new test, and the new test fails against `main`'s `provisioning.ts`.

## Notes
