---
id: ADR-0093
title: Domain-Pending Tenant Provisioning
status: accepted
date: 2026-08-20
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0093: Domain-Pending Tenant Provisioning

- **Status:** Accepted
- **Date:** 2026-08-20
- **Affects:** tower
- **Supersedes:** the "require domain unconditionally" resolution in [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md)'s "Resolved 2026-08-19" section

## Context

ADR 0091 made every tenant's `domain` required at creation, closing an open item by deciding
against the "no domain infrastructure ready yet" convenience ADR 0067 originally designed for
self-service signup. On reflection that trade was worse than necessary — nothing about ADR
0091's actual goal (a globally-unique domain per tenant) requires the domain to be known at the
exact moment the tenant record itself is created, only before anything that needs to compute a
host from it runs.

## Decision

`domain` becomes optional at creation, for both callers.

### `domain` becomes optional at creation, for both callers

`POST /tenants` no longer requires `domain` in its body. When present, behavior is unchanged
from ADR 0091 (full provisioning happens in one request). When absent, the tenant is created in
a **domain-pending** state: the `tenant` actor exists, but everything that needs a real hostname
is deferred.

### What runs immediately regardless of domain

- Tenant creation itself (`tenant.create`, `domain: null`).
- Default provider seeding + its client-secret push.
- The four per-tenant secrets (session key, internal key, identity-hash-key generation 1,
  contact-hash-pepper) — none of these are domain-derived, no reason to wait.

### What's deferred until a domain is set

- Auto-creating the `_admin` application (its `hosts` field is `authstar.<domain>` — nothing to
  put there yet).
- Registering the tenant's config with portcullis (`patchConfig`) — portcullis's own schema
  requires at least one application with real hosts (`validate.rs`'s `NoApplications` check), so
  this is structurally impossible before an application exists, not just a scheduling choice.
- Issuing the first-admin invite — there's no reachable admin console yet to link to.

### New route: `PATCH /tenants/:tenantSlug/domain`

Body: `{ domain: string }`. Same auth gate as `POST /tenants` (operator bearer token, or
unauthenticated when `provisioning.selfServiceEnabled`). Validates the domain exactly like
creation does (format, global uniqueness — a domain-pending tenant is invisible to that
uniqueness check until this route runs, same as any other tenant before its domain is set).
Rejects if the tenant already has a domain (immutable once set, no re-pointing in this pass).
On success, runs every deferred step from above — `_admin` app creation, portcullis
registration, first-admin invite — using the now-known domain, then returns the same
`{slug, domain, adminHost}` shape `POST /tenants` already returns. Idempotent on retry, same
check-then-act convention as every other step in this route.

### `TenantState.domain` becomes `string | null`

Every consumer of a tenant's `domain` (steward's detail view, the `perTenantJwksKeyProvider`
resolver, invite-host resolution) already has to handle "this tenant doesn't have one yet" as a
real, valid state — not an error. `steward`'s `TenantDetailResponse.domain` type widens to
`string | null` to match; its existing conditional admin-URL display already only renders when a
domain is present, so no behavior change needed there beyond the type.

## Consequences

- **tower**: `domain` removed from `POST /tenants`'s required fields; new `tenant.set-domain`
  command/event; new `PATCH /tenants/:tenantSlug/domain` route that runs the deferred
  provisioning steps; `TenantState.domain` becomes nullable.
- **steward**: `TenantDetailResponse.domain` type widens to `string | null` (no UI behavior
  change — the admin-URL display already guards on presence).
- **web**, **portcullis**: unaffected — a domain-pending tenant is invisible to both until its
  domain is set and portcullis registration actually runs.
- Public self-service signup (ADR 0068) can now be built without inventing an
  authstar-hosted-subdomain fallback — a signer-upper without a domain yet simply completes
  later via the new route. ADR 0068's own UI work is still not designed here.

## Related

- [ADR 0067](0067-tenant-creation-and-provisioning.md), [ADR 0068](0068-tenant-creation-ui-surfaces.md), [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md)
