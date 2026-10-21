---
id: ADR-0011
title: Minimizing Tower's Signet Configuration Footprint
status: accepted
date: 2026-07-22
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0011: Minimizing Tower's Signet Configuration Footprint

- **Status:** Accepted
- **Date:** 2026-07-22
- **Affects:** tower
- **Refines:** [ADR 0009](0009-tenant-data-via-syncbundle-no-github.md)

> **Extended 2026-08-01:** whether this elevated token covers writing to tower's *own* service
> bundle (not just portcullis's tenant-prefixed one) was left implicit here. [ADR 0067](0067-tenant-creation-and-provisioning.md)
> confirms it does — tenant creation needs to push `contact-hash-pepper` into tower's own bundle
> as part of the same provisioning flow that pushes other secrets to portcullis's.

## Context

ADR 0009 removed the GitHub-repo dependency for tenant provisioning, but left tower needing to
construct real git commits (for `SyncBundle`'s `head_sha`) and hold a distinct elevated
credential for `GitOpsService`/`AdminService` access. Concern raised: this still means "anyone
installing an authstar instance" carries meaningful extra configuration burden, and tower
itself has to accept a growing, special-cased configuration surface just to support tenant
provisioning — in tension with the "install alongside signet" simplicity ADR 0004 is aiming
for.

Two things reduce this further:

1. `SyncBundleHeader.head_sha` is documented as "used for audit logging... **may be empty for
   non-git sources**." Tower does not need to be a git client at all — it can build a plain
   directory tree (no `git init`/commit), tar it, and stream it via `SyncBundle` with an empty
   `head_sha`. This trades a real commit SHA for a timestamp-only audit entry, in exchange for
   removing an entire dependency (an embedded git library or shelling out to `git`) from
   tower's implementation.
2. Tower's elevated `GitOpsService`/`AdminService` bearer token does not need its own separate
   configuration channel. It can simply be **one more secret in tower's own signet bundle** —
   fetched the exact same way tower fetches its DB connection string or its RabbitMQ
   credential, via the standard workload `SecretsService`/SPIFFE-mTLS path every service
   already uses. The token itself is provisioned once, by a human operator, through the same
   standard (human-authored, GitHub-or-manual) secrets flow every other piece of non-tenant
   operational config already goes through — no new ceremony, just one more key in an existing
   file.

## Decision

Minimizing Tower's Signet Configuration Footprint.

- Tower builds `SyncBundle` payloads as plain file trees, not real git repositories.
  `head_sha` is sent empty.
- Tower's `GitOpsService` admin bearer token is delivered as a secret within tower's own
  service-scoped signet bundle (`secrets/<env>/tower/signet-admin-token.yaml` or equivalent),
  fetched via tower's normal workload bootstrap — not a separately configured credential path.

Net effect: tower's bootstrap configuration footprint for signet is identical to any other
authstar service — a signet address and a SPIFFE identity. Everything else, including the
elevated token needed for tenant provisioning, arrives through the one bundle-fetch path every
service already has. A new self-hosted install has exactly one manual step tied to this: an
operator provisions tower's own secrets (including this token) once, the same way they'd
provision any other service's operational secrets — not a distinct "set up tenant provisioning"
procedure.

## Consequences

- No git library dependency in tower.
- No new configuration category introduced for self-hosted installers — tower's signet
  bootstrap is uniform with every other service.
- Audit entries for tenant provisioning via `SyncBundle` carry no commit SHA (empty
  `head_sha`), relying on signet's own ingestion timestamp plus tower's event-sourced record
  (per ADR 0009's existing rationale) rather than git history for provenance.

## Related

- [ADR 0009](0009-tenant-data-via-syncbundle-no-github.md)
- [ADR 0004](0004-signet-for-configuration-and-secrets.md)
