# ADR 0013: Tenant Discovery via Signet

- **Status:** Superseded by [ADR 0014](0014-single-bundle-prefixed-tenant-keys.md)
- **Date:** 2026-07-22
- **Affects:** portcullis, tower

> **Superseded 2026-07-22.** The separate discovery document and dynamic per-tenant
> watch-add/remove behavior below added a second portcullis↔tower coupling to avoid a restart
> that was never actually avoidable — a bundle change already triggers one. See
> [ADR 0014](0014-single-bundle-prefixed-tenant-keys.md), which folds the tenant list into
> portcullis's single bundle and drops the dynamic watch machinery entirely. Kept below for the
> record of what was considered.

## Context

ADR 0007's wildcard policy (`spiffe://.../ns/*/sa/portcullis`) grants portcullis access to any
tenant namespace, but access isn't discovery — portcullis still needs to know which tenant
namespaces currently exist in order to call `GetServiceBundle` for each, and which `Host`
header(s) map to which tenant to perform the tenant resolution ADR 0002 requires before session
JWT verification. `signet-proto` has no "list namespaces" RPC.

## Decision

Tower maintains a plain (non-secret) config document under portcullis's **own** service scope —
not a tenant namespace — listing every active tenant and its hostname mapping:

```
config/<env>/authstar/portcullis.yaml
```

```yaml
tenants:
  - slug: acme
    hosts: [acme.example.com]
  - slug: widgets
    hosts: [widgets.example.com, app.widgets.io]
```

Tower keeps this current via the same `SyncBundle` flow (ADR 0009/0011) whenever a tenant is
created, its hostnames change, or it's fully offboarded. Portcullis fetches and watches this
document as part of its own bootstrap bundle (`ns/authstar/sa/portcullis`), and for each listed
tenant, fetches — and watches — that tenant's own namespaced bundle
(`ns/tenant-<slug>/sa/portcullis`) for its operational config and signing keys.

### Suspension vs. deletion

A **suspended** tenant (e.g. non-payment) stays on this list. Portcullis continues to recognize
its host and route requests into the normal auth gate, where the enrichment `Deny` outcome
(ADR 0001/0003) produces a proper, generic-but-informative rejection. Removing it from this
list is reserved for full tenant **deletion/offboarding** — at that point the host should stop
resolving at all (portcullis has no tenant to route it to) rather than depend on a
still-running per-request Deny to explain why. Conflating the two would mean a merely-suspended
tenant's users get an opaque host-not-found instead of the response the rest of the system is
designed to give them.

## Consequences

- Portcullis must support adding/removing per-tenant watches at runtime as this list changes —
  a newly created tenant needs to start being served without a portcullis restart, since the
  restart-on-change model (ADR 0004) applies to *this* bootstrap document changing, not to
  needing a restart every time a tenant is added.
- Story 013 (auth gate)'s tenant-resolution stage now has a concrete data source: this document,
  not something invented per-request.

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md), [ADR 0007](0007-signet-tenant-namespace-mapping.md)
