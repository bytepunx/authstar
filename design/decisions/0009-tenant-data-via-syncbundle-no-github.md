# ADR 0009: Tenant Config and Secrets via SyncBundle — No GitHub Dependency

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** tower
- **Amends:** [ADR 0007](0007-signet-tenant-namespace-mapping.md) (drops the `authstar-tenants` GitHub repo)

## Context

ADR 0007 proposed a dedicated GitHub repo (`authstar-tenants`) registered with signet via
`RegisterRepository`, with per-tenant data separated by namespace-scoped paths within it. The
question raised: since `signet-proto`'s `SyncBundle` RPC exists specifically to ingest "a
tar.gz of a local git working tree directly to signet without requiring a remote repository,"
is there a case for using it — with a local, in-cluster git tree — instead of setting up a
GitHub-hosted repo and webhook sync at all for this data?

Checking the actual message definitions confirms it holds up:

- `SyncBundleHeader` carries no reference to a `RegisterRepository`-created repository ID —
  `SyncBundle` is a fully standalone ingestion path, not dependent on any prior registration.
- `SyncBundleHeader.head_sha` is "used for audit logging... may be empty for non-git sources" —
  a real, even never-pushed, local git commit still produces a genuine audit trail entry in
  signet.
- `SyncBundleResponse` reports `secrets_added`/`secrets_updated`/`secrets_deleted` counts —
  signet diffs against its current stored state, so each call needs to supply current state,
  not replay full history.

## Decision

All per-tenant data — both config and secrets, not just key material — is provisioned via
`SyncBundle` from an in-cluster, tower-constructed local git tree. No GitHub-hosted repository
is registered for tenant data; the `authstar-tenants` repo proposed in ADR 0007 is dropped.

Tower constructs a local git tree (via an embedded git library or shelling to `git`) reflecting
the current config/secrets for the tenant namespace being provisioned or updated, commits it,
and streams it to signet via `SyncBundle`, capturing the resulting `head_sha` for signet's own
audit log. The local tree does not need durable storage of its own:

- Signet's own CockroachDB-backed storage becomes the durable copy the moment it's ingested.
- Tower is itself the authoritative, event-sourced (via consequent) source of tenant state. If
  the local tree were ever lost, tower's own domain events already capture "what changed, when,
  why" — with more semantic value than a git diff of SOPS ciphertext would provide anyway,
  since an encrypted blob's diff carries no human-readable meaning.
- Tower can regenerate an equivalent tree from its own current state at any time if ever needed
  for inspection.

This does **not** change anything about genuinely human-authored, infrequently-changed,
non-tenant operator config (e.g. environment-wide settings, which OIDC providers are globally
available) — that class of data still benefits from a GitHub-hosted, PR-reviewed repo per
signet's normal model. This ADR is scoped to per-tenant, automation-provisioned data only.

## Consequences

- Tower needs an embedded git-tree-construction capability (e.g. `isomorphic-git` if
  implemented in Node, or shelling out to system `git`) to build each `SyncBundle` payload.
- No GitHub App, deploy key, or webhook configuration is needed for tenant provisioning.
- Tower's `GitOpsService`/`AdminService` access (already flagged in ADR 0007 as a distinct,
  more-privileged credential from its own workload bundle) now also covers `SyncBundle` calls,
  not just `GetSOPSPublicKey`.
- The signet namespace-per-tenant convention from ADR 0007
  (`ns/tenant-<slug>/sa/portcullis`, wildcard policy) is unchanged — only the transport for
  getting that data into signet changes.

## Related

- [ADR 0007](0007-signet-tenant-namespace-mapping.md)
- `~/git/signet-proto/proto/admin/v1/admin.proto` — `SyncBundle`/`SyncBundleHeader`/`SyncBundleResponse`
