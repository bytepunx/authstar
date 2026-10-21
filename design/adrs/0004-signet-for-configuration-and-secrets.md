---
id: ADR-0004
title: Configuration and Secrets via Signet (Hard Dependency)
status: accepted
date: 2026-07-21
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0004: Configuration and Secrets via Signet (Hard Dependency)

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** portcullis, tower, keep, web
- **Supersedes (in part):** [ADR 0002](0002-multi-tenant-architecture-and-key-management.md)

## Context

Signet (`~/git/signet`) is a Kubernetes-native, SPIFFE/SPIRE-based configuration and secrets
service, built by bytepunx prior to this iteration of authstar specifically to solve secure
config/secrets distribution with git provenance. Since it already exists and does exactly what
ADR 0002 left as an open research item — durable, encrypted, auditable secret storage with
controlled distribution — authstar takes a **hard dependency** on it rather than building or
continuing to sketch a bespoke equivalent.

All four services (portcullis, tower, keep, web) source their configuration and secrets from
signet. There is no static-YAML-only deployment mode; the question ADR 0002 left open about
whether a signet-free local/self-hosted config path was worth preserving is resolved: it
isn't. This is also expected to shift authstar's own distribution model — installed alongside
signet in a customer's cluster, under a similar license, rather than assuming a single
bytepunx-hosted deployment is the only shape.

## Decision

Every service fetches its bundle from signet at startup and holds it in memory.

### Every service fetches its bundle from signet at startup and holds it in memory

Each service registers as a signet workload (`ns/<namespace>/sa/<service>`) and calls
`GetServiceBundle` at startup to retrieve merged config (plain YAML) and secrets
(SOPS/age-encrypted, decrypted server-side by signet, delivered per-secret over SPIFFE mTLS).
The bundle is held only in memory — never written to environment variables, disk, or anywhere
else a coexisting process could read it. This is a stronger guarantee than the read-through
cache portcullis-and-tower-shared-valkey design in ADR 0002 provided.

### Live changes trigger a coordinated restart, not a hot-reload

Services use `WatchServiceBundle` (change notification) + `AcquireRestartLock` +
`GetServiceBundle` (refetch) to pick up config/secret changes: on notification, the service
finishes in-flight work, acquires the fleet-wide restart lock (serializing restarts across
replicas), and exits; the replacement process fetches the fresh bundle on its own normal
startup. No in-process hot-patching of live state. Rust services use the `signet-client` crate
directly (already published, already implements this pattern via `wait_for_restart`); no
separate process-manager sidecar is required for services embedding the client library
directly.

### Supersedes ADR 0002's valkey read-through tier

ADR 0002 proposed a shared valkey cache, populated by tower, that portcullis would read
directly for tenant operational config and signing keys, falling back to tower's API on a
miss. That mechanism is retired in favor of signet's `GetServiceBundle` + watch/restart
pattern, which is strictly better for this use case: no network call at all at signing time
(bundle is already in-process memory), no cache-population code to write and operate in tower,
and git-native audit history for free.

**ADR 0002's other decisions are unchanged**: multi-tenant is still the target architecture,
and each tenant still gets independent, per-purpose (session vs. internal) signing keys. Only
the delivery mechanism changes — those keys are now SOPS-encrypted secrets in signet rather
than rows in a tower-managed, valkey-fronted store.

### Claims enrichment (ADR 0001 / ADR 0003) is unaffected

User claims (roles, account status, entitlements) are runtime application data, not
configuration or secrets, and stay entirely out of signet's scope. The claims enricher's live
call to tower's API, the three-way outcome, and the `enrichment_status` claim are unchanged by
this decision.

## Consequences

- **Story 001** (YAML configuration): the schema largely survives — signet's non-secret config
  format is "an ordinary YAML mapping," so the shape of what Story 001 defined is reusable.
  What changes is the source: config is fetched from signet's `GetServiceBundle`, not read
  from a local file path. `AUTHSTAR_CONFIG_PATH` goes away; a small bootstrap surface (how to
  reach signet itself — trust domain, signet address, this workload's namespace/service name)
  replaces it.
- **Story 002** (env var overrides): the rich override chain (defaults → YAML → ENV) is
  largely superseded — signet's git-reviewed config *is* the override mechanism now, not
  runtime environment variables. Only the minimal bootstrap surface above remains
  env-configured, since it must exist before a signet connection can be made at all.
- **Story 008/009/010** (session/internal JWT key handling, per ADR 0001/0002): key loading
  changes from "load static PEM files at startup" to "keys arrive as secrets in the bundle
  fetched from signet, held in memory, refreshed via the watch/restart cycle above."

## Open Questions

- **How tenants map onto signet's namespace/service model** — one shared bundle for all
  tenants vs. one signet namespace per tenant with a wildcard cross-namespace policy. Not
  resolved here; needs its own follow-up, likely informed by what `signet-proto`'s
  `GitOpsService` actually exposes for automating tenant onboarding as git commits.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md), [ADR 0003](0003-enrichment-outcome-response-contract.md) — unaffected, claims stay a live tower API call
- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) — multi-tenant + per-tenant
  keys decisions retained; valkey delivery mechanism superseded by this ADR
- `~/git/signet/docs/configuration.md`, `~/git/signet/docs/secrets-workflow.md`,
  `~/git/signet/docs/restart-lock.md`
- `~/git/signet-clients/rust` — the client library portcullis (and other Rust services, if
  any) will use directly
