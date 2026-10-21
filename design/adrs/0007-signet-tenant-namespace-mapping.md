---
id: ADR-0007
title: Signet Tenant/Namespace Mapping and Automated Tenant Onboarding
status: superseded
date: 2026-07-21
updated: 2026-09-23
supersedes: []
superseded_by: [ADR-0014]
---
# ADR 0007: Signet Tenant/Namespace Mapping and Automated Tenant Onboarding

- **Status:** Superseded by [ADR 0014](0014-single-bundle-prefixed-tenant-keys.md)
- **Date:** 2026-07-21
- **Affects:** portcullis, tower
- **Resolves an open item in:** [ADR 0004](0004-signet-for-configuration-and-secrets.md)

> **Superseded 2026-07-22.** The per-tenant-namespace design below turned out to buy nothing:
> portcullis already reacts to any bundle change via a coordinated restart (ADR 0004), so
> adding a tenant triggers that same cycle regardless of how tenant data is organized within
> the bundle. See [ADR 0014](0014-single-bundle-prefixed-tenant-keys.md) for the corrected
> single-bundle, prefixed-key design. Kept below for the record of what was considered.

## Context

ADR 0004 left open how authstar's tenants map onto signet's convention-first,
namespace/service-scoped access model: one shared bundle for all tenants, or one signet
namespace per tenant. Resolving it required knowing whether tenant onboarding (including
self-service SaaS signup) can be automated as git commits, since `signet-proto`'s
`GitOpsService` was the natural place to look for that capability.

It doesn't provide one. `GitOpsService` covers only signet's side of the relationship: SOPS
age-key lifecycle (`GetSOPSPublicKey`, `RotateSOPSKey` — scoped per *environment*, not
per-tenant), GitHub repository registration/sync (`RegisterRepository`, `TriggerSync`), and a
`SyncBundle` RPC that ingests a local git working tree directly (as a tar.gz) without a remote
repository at all. Authoring and committing the actual encrypted files is explicitly left to
whatever pushes to the registered repository — there is no "write and commit a secret" RPC.

That's sufficient: it means an automated onboarding flow can fetch the right environment's SOPS
public key, encrypt the new tenant's config/secrets itself, and commit them via ordinary git/
GitHub tooling (or `SyncBundle` for a faster, webhook-independent ingestion path) — self-service
signup and git-native provenance are not in tension.

## Decision

One signet namespace per tenant, not one shared bundle.

### One signet namespace per tenant, not one shared bundle

Each tenant gets its own signet namespace: `ns/tenant-<slug>/sa/portcullis`. Portcullis's
shared fleet identity is granted access across all of them via a single wildcard policy —
`spiffe://<trust-domain>/ns/*/sa/portcullis` — the same pattern already demonstrated in
`signet-smoke-test`'s cross-namespace grant. No per-tenant policy is created or maintained.

This gives each tenant an independent git history for its own config/secrets (clean audit
trail, independent rotation, no noisy shared diffs as tenant count grows) at no ongoing
operational cost, since the wildcard policy is created once.

### Path convention: environment outer, tenant inner

Signet's own SOPS keys are scoped per-environment (`GetSOPSPublicKeyResponse.environment`),
matching the existing `config/<env>/...` / `secrets/<env>/...` convention from
`docs/configuration.md`. Tenant namespace nests inside that:

```
config/prod/tenant-acme/portcullis.yaml
secrets/prod/tenant-acme/portcullis/session-key.yaml
secrets/prod/tenant-acme/portcullis/internal-key.yaml
```

### Automated tenant onboarding

Tower's tenant-provisioning flow (triggered by self-service signup or an admin action)
authors the new tenant's files and commits them to a dedicated tenant-config repository
(**not** the `design` repo — that's for decisions/stories/docs, not live encrypted secrets; a
new repo is needed, e.g. `authstar-tenants`, registered with signet via `RegisterRepository`).
This requires tower to hold two capabilities distinct from a normal workload's signet access:

- A GitHub credential to push commits (itself a signet-managed secret for tower's own
  operational identity, per ADR 0004 — no special-casing needed there).
- **`AdminService`/`GitOpsService` bearer-token access**, narrowly scoped to
  `GetSOPSPublicKey` for the relevant environment. This is a materially more privileged signet
  access tier than the workload-level `SecretsService` access every service uses for its own
  bundle, and should be issued/scoped as such — not folded into tower's ordinary workload
  identity.

## Consequences

- A new repo is needed to hold tenant config/secrets (working name `authstar-tenants`),
  separate from `design`. Not created yet — flagging as a concrete next step.
- Tower's provisioning flow needs a documented, narrowly-scoped path to admin-level signet
  access (distinct credential/policy from its own workload bundle) — not designed in detail
  here, but the boundary is established.
- `SyncBundle` is worth using for the actual onboarding request path (avoids waiting on a
  GitHub webhook round-trip for a self-service signup to take effect), with the parallel git
  push still happening for audit/provenance.

## Related

- [ADR 0004](0004-signet-for-configuration-and-secrets.md)
- `~/git/signet-proto/proto/admin/v1/admin.proto` — `GitOpsService` definition
- `~/git/signet-smoke-test/README.md` — wildcard cross-namespace policy pattern
