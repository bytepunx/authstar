---
id: ADR-0014
title: Single Bundle with Prefixed Tenant Keys
status: accepted
date: 2026-07-22
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0014: Single Bundle with Prefixed Tenant Keys

- **Status:** Accepted
- **Date:** 2026-07-22
- **Affects:** portcullis, tower
- **Supersedes:** [ADR 0007](0007-signet-tenant-namespace-mapping.md), [ADR 0013](0013-tenant-discovery.md)
- **Amends the path examples in:** [ADR 0009](0009-tenant-data-via-syncbundle-no-github.md)

## Context

ADR 0007 gave each tenant its own signet namespace (`ns/tenant-<slug>/sa/portcullis`) with a
wildcard cross-namespace policy, and ADR 0013 built a separate tenant-discovery document plus
dynamic per-tenant watch management on top of that, so portcullis could learn which namespaces
existed and start/stop watching them at runtime without a restart.

That second piece of complexity was never actually earning its keep. Portcullis already
reacts to any bundle change via the standard signet watch → coordinated-restart cycle (ADR
0004) — adding a new tenant changes the bundle and triggers that same cycle regardless of how
tenant data is organized within it. Since a rolling restart happens either way, there is no
operational benefit to per-tenant namespaces or to the dynamic watch-add/remove machinery ADR
0013 introduced to avoid a restart that was never actually avoidable. That machinery was
solving a problem that didn't exist, at the cost of a second signet dependency edge between
portcullis and tower (the discovery document) beyond the one already needed for tenant
config/secrets themselves.

## Decision

Portcullis has exactly **one** signet scope: `ns/authstar/sa/portcullis`. No per-tenant
namespaces, no wildcard cross-namespace policy.

- **Tenant list and hostname mapping** is a top-level section of this single bundle's plain
  config, not a separately-fetched document:

  ```yaml
  tenants:
    acme:
      hosts: [acme.example.com]
    widgets:
      hosts: [widgets.example.com, app.widgets.io]
  ```

- **Tenant-specific config** (providers, CORS origin, cookie domain, upstream routing, exempt
  list) lives nested under that same `tenants.<slug>` key in the same document.
- **Tenant-specific secrets** (the two signing keypairs per tenant, per ADR 0002) are named
  with a `tenant-<slug>-` prefix in the bundle's flat `secrets` map — e.g.
  `tenant-acme-session-key`, `tenant-acme-internal-key` — rather than living in a
  tenant-specific namespace.

Portcullis fetches this one bundle at startup (`GetServiceBundle`), watches it
(`WatchServiceBundle`), and reacts to any change — a new tenant, a rotated key, an updated
provider list, anything — through the single, already-existing coordinated-restart cycle. No
per-tenant watch is opened or torn down at runtime.

Tower remains the authority that provisions tenant data and pushes it into this bundle via
`SyncBundle` (ADR 0009/0011) — that relationship is unchanged. What's removed is the *second*,
special-purpose coupling ADR 0013 added on top of it.

## Consequences

- **ADR 0007 and ADR 0013 are superseded** — their per-tenant-namespace and dynamic-discovery
  designs are replaced by this ADR. Their context/rationale sections remain as a record of what
  was considered and why it was reconsidered; their decisions no longer apply.
- **ADR 0009's path examples are corrected**: `secrets/prod/tenant-acme/portcullis/*.yaml`
  becomes a flat, prefixed name within portcullis's single `secrets/` path —
  `secrets/prod/authstar/tenant-acme-session-key.yaml`, etc. Its core decision (no GitHub
  dependency, `SyncBundle` from an in-cluster tree) is unchanged.
- Story 001 (`stories/proxy/001-configuration-and-secrets.md`) needs rewriting to drop the
  per-tenant `GetServiceBundle`/`WatchServiceBundle` loop and the runtime watch-add/remove
  behavior, replacing it with the single-bundle model above.
- Blast radius note carried over from ADR 0002 unchanged: keys are still logically independent
  per tenant (a `tenant-acme-*` secret compromise doesn't expose `tenant-widgets-*`) — only the
  *delivery* mechanism (prefixed names in one bundle vs. separate namespaces) changed, not the
  isolation of the key material itself.

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) — per-tenant key isolation, unchanged
- [ADR 0004](0004-signet-for-configuration-and-secrets.md), [ADR 0009](0009-tenant-data-via-syncbundle-no-github.md), [ADR 0011](0011-minimizing-towers-signet-footprint.md)
