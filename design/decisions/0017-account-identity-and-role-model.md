# ADR 0017: Account, Identity, and Role Model

- **Status:** Accepted (role opacity partially revised by [ADR 0047](0047-application-and-role-slug-validation.md))
- **Date:** 2026-07-24
- **Affects:** tower, portcullis
- **Resolves an open item in:** [ADR 0016](0016-application-layer-and-sso-scope.md)

> **Note (2026-07-30):** roles remain app-interpreted, opaque-to-tower *strings* as designed
> below — tower still never interprets what a role name grants. What changed is that a role's
> `(name, scope)` now must be pre-registered in a tower-owned catalog before it can be granted
> anywhere (ADR 0047) — a validation gate, not a reversal of tower's non-interpretation of role
> *meaning*.

## Context

Following on from the tenant-scoped identity resolution already settled (ADR 0001's
`(idp, idp_sub)` resolution key, made tenant-scoped when application/tenant separation was
introduced): what does tower's `account` actor actually hold, how do roles attach to it, and —
the open item from ADR 0016 — does claims enrichment need to become application-aware so a
single account can hold different roles on different applications within one tenant (the
Stack-Overflow-style case)?

## Decision

### `identity` actor

Business key `{tenant}:{idp}:{idp_sub}`. State: `{ accountId, email }` — `email` is captured at
last login as a linking hint (per ADR 0001), never authoritative identity data.

### `account` actor

Business key: a generated id (flake-based). Tenant-scoped, but not part of the key itself —
carried as a state field.

```ts
{
  actor: { namespace: 'tower', type: 'account', identifiedBy: 'accountId',
           searchableBy: ['tenant', 'profile.email', 'status'] },
  state: {
    tenant: '',
    profile: { email: '', name: '' },
    status: 'active',        // active | suspended | deleted
    emailVerified: false,
    roles: [],
  }
}
```

`searchableBy` exists for `web`'s admin UI to list/search a tenant's accounts — a `find()`-backed,
eventually-consistent-is-fine path, entirely separate from the enrichment hot path (which never
uses search).

### Roles are scoped per application, not just tenant-wide

```ts
roles: [
  { name: 'admin', scope: 'tenant' },                      // applies across every application
  { name: 'moderator', scope: { application: 'math' } },   // applies only to the 'math' application
]
```

This resolves ADR 0016's open question: yes, enrichment must become application-aware.
`EnrichmentContext` (ADR 0001) gains a fourth field — `application` (the resolved application
slug) — alongside `idp`/`idp_sub`/`email`, so tower can filter to `tenant`-scoped roles plus
that specific application's roles, rather than returning every role the account holds anywhere
in the tenant.

### Roles are names only — no permission sets in claims

A role is a string tag. Tower asserts "this account holds role X [for application Y]"; it does
not interpret or ship what X grants. `Allow(claims)` carries `{ accountId, roles: string[] }` —
nothing more. This is a deliberate size/latency choice: role names are small and change rarely;
a full permission set is potentially large, more dynamic, and would bloat every internal token
signed on every authenticated request for no benefit most upstream applications need. How
permissions attached to a role name actually get interpreted — entirely inside the consuming
application, entirely centralized in tower/`web`, or some hybrid — is **explicitly undecided**
and deferred; role names alone are sufficient for v1 and don't foreclose any of those options
later.

### View actor

A view actor aggregates `identity` + `account` events into the single materialized state the
enrichment endpoint reads, keyed from the identity's business key (what portcullis's
enrichment call actually has on hand).

## Consequences

- Portcullis's `EnrichmentContext` (ADR 0001, Story 010) needs a fourth field: `application`.
- Tower's HTTP enrichment endpoint needs to accept and use `application` to filter returned
  roles.
- Permission-set management is a tracked, undecided follow-on question — not blocking, since
  nothing here forecloses adding it later.

## Related

- [ADR 0001](0001-claims-enrichment-via-tower.md), [ADR 0016](0016-application-layer-and-sso-scope.md)
