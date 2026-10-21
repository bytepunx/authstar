---
id: ADR-0100
title: Multi-Organization Membership and an Open Org-Role Catalog
status: accepted
date: 2026-08-28
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0100: Multi-Organization Membership and an Open Org-Role Catalog

- **Status:** Accepted
- **Date:** 2026-08-28
- **Affects:** tower, keep, portcullis, authstar-clients, web
- **Supersedes:** [ADR 0090](0090-organizations-shared-billing-administration-and-succession.md), [ADR 0098](0098-organization-permission-lifecycle.md)
- **Related:** [ADR 0099](0099-hosted-tenant-brandable-ui-surfaces.md) (Part E below resolves that ADR's "embed vs. redirect" and "auth boundary" open questions for the organization-management concept specifically)

## Context

Building organization support into a real tenant application (loci) surfaced three compounding
gaps in ADR 0090/0098's design, not implementation bugs:

1. **No way to scope a role to "while acting within org Y."** `organization:manage`/
   `organization-billing:manage` are flat permissions, safe only because ADR 0090 constrained an
   account to at most one organization. The moment an account can belong to more than one — a
   real, legitimate case (someone manages both their family's and their employer's org) — a flat
   permission can no longer say *which* organization it's for.
2. **A fixed enum/boolean shape for org standing doesn't extend.** ADR 0090/0098 model org
   standing as `role: 'member' | 'manager'` plus a `organization-billing:manage` boolean-shaped
   permission. The first time a real distinction is needed beyond that (billing-view-only vs.
   billing-admin, raised while scoping this exact work) it forces another breaking change through
   every layer — the same wall app-scoped roles already solved by being an open, catalog-validated
   vocabulary (`roleDefinition`, Story 006) rather than a closed enum. There's no reason
   organization-scoped standing should use a narrower mechanism than app-scoped standing already
   does.
3. **Entitlement fan-out (ADR 0098) resolves to managers, not the organization itself**, so a
   plan's granted roles land on individual accounts' `roles` arrays — indistinguishable from roles
   that account earned personally. A member who is also, separately, a paying individual customer
   would have their org's entitlement leak into their personal usage once the app can't tell the
   two apart. Keeping org-granted standing on the organization record itself, never merged onto
   any account, is the only way to keep "acting within org Y" and "acting as myself" distinguishable
   downstream.

## Decision

`organizationMembership` — its own tracked actor, not a list or a flat field.

### `organizationMembership` — its own tracked actor, not a list or a flat field

```ts
{
  actor: { namespace: 'tower', type: 'organizationMembership', identifiedBy: 'id',
           searchableBy: ['tenant', 'accountId', 'organizationId'] },
  state: {
    tenant: '', accountId: '', organizationId: '',
    roles: [],                          // open vocabulary, see below
    successorAccountId: null,           // meaningful only while 'manager' is among roles
    createdAt: '',
  }
}
```

An account can hold any number of these, one per organization it belongs to — replacing ADR
0090's `account.organizationId` (at most one) and `organization.managers[]`/`.successors`
(reverse-tracked on the org). This is the same "membership is its own record, not a list on
either side" shape `identity.accountId` already uses instead of `account` holding a reverse list
— avoiding the two-actor dual-bookkeeping problem ADR 0090 itself already reasoned about, just
applied one more time now that membership is many-to-many instead of many-to-one.

`organization_actor` simplifies to `{ organizationId, tenant, name, grantedRoles, seatLimit,
createdAt }`. `grantedRoles`/`seatLimit` are populated *only* by keep's entitlement events (see
below) — never by any membership or role grant on the org itself — which is what keeps
org-purchased entitlement from ever being confused with what an individual membership record
grants.

### Organization roles are an open, catalog-validated vocabulary — the same mechanism app-scoped roles already use

`roleDefinition`'s `scope` widens from `'tenant' | {application}` to `'tenant' | 'organization' |
{application}`; `roleDefinitionKey` gains a third key shape, `${tenantSlug}:organization:${name}`
(the same two-segment shape app-scope keys already use, with the literal `organization` in place
of an app slug — `organization` becomes a reserved application slug to keep this unambiguous).
A membership's `roles` are validated against this catalog via `rolesValid`, the same helper
invite/account role grants already call.

Four roles are seeded per tenant at provisioning time and are permanently protected from
retirement: **`manager`**, **`member`**, **`billingAdmin`**, **`billingViewer`**. `manager` and
`member` are interpreted by tower itself (who can administer the org — invite, promote, remove);
`billingAdmin`/`billingViewer` are interpreted by keep's Billing Portal route (full vs.
read-only access). This is authstar interpreting a role, which ADR 0069 otherwise forbids — but
org administration and billing-portal gating are authstar's own access-control primitives, not
app-specific meaning, the same justification `accounts:manage` already rests on. A tenant can
define further org-scope roles beyond the four defaults exactly the way it defines app-scope
roles today; anything beyond the four is uninterpreted by authstar, reserved for whatever the
tenant/app wants it to mean.

### Claims shape: a list of memberships, not one optional id

`InternalClaims.organizationId?: string` becomes `organizationMemberships: Array<{
organizationId: string, roles: string[] }>` — always present (empty array), matching how
`roles`/`permissions` are already always-present rather than optional. This propagates through
three layers: `@bytepunx/authstar-core`'s TypeScript type (the source of truth for the TS
ecosystem, published from the public `authstar-clients` repo), portcullis's Rust
`InternalClaims`/`AllowOutcome` (`jwt/internal.rs`, `enricher.rs`), and every consuming service's
own decoded view (tower, keep, and any tenant application — loci first).

A caller checks standing in a specific org by finding that org's entry in the array and
inspecting its `roles`, not by an equality check against a single flat id — this is the concrete
mechanism that makes "different orgs can confer different standing to the same account"
representable at all.

### Entitlement publishing: straight to the organization, no fan-out

ADR 0098's manager fan-out (`organization.manager-*` AMQP events, keep's
`organization-manager-cache.ts`) is removed entirely. `EntitlementScope` gains `{organization}`
as a first-class scope alongside `{account}`/`{tenant}`; keep publishes one entitlement event
directly to the organization. Tower's `entitlement-consumer.ts` handles it the same way it
already handles account/tenant scope, just dispatching `organization.grant-role`/`revoke-role`
(appending to `organization.grantedRoles`) and `organization.set-seat-limit` instead. This is
strictly simpler than ADR 0098's design *and* fixes the entitlement-leakage concern in Context
#3 for free, since org-granted roles now live only on the organization record, never merged onto
any individual account's `roles`.

`organization.seatLimit`: `null` means **one seat (the creator only)**, not "unlimited" —
deliberately diverging from `PlanMapping.seatLimit`'s usual null-means-unlimited convention,
because it's the concrete mechanism preventing "create an org, invite people, never pay." A
non-null seat limit is set only by a keep entitlement event tied to an actual subscription.

### Embeddable org-management UI in `web`, resolving part of ADR 0099's proposal

A new route group in `authstar/web`, `(embed)/organizations/[organizationId]`, provides member
list, invite, promote/demote, and billing-role grant/revoke — gated on the caller's own
`organizationMemberships` including that org, not the tenant-staff admin permission the `(admin)`
group uses. Tenant applications embed this via `<iframe>` rather than rebuilding the same forms
against tower's raw API, authenticating through the same shared session cookie every tenant app
already rides on (same-registrable-domain, so this is same-site, not subject to third-party-cookie
restrictions). Styling crosses the iframe boundary only through a small, explicit set of CSS
custom properties driven by a `theme` query param — an explicit contract, not arbitrary CSS
injection.

This answers ADR 0099's "embed vs. redirect" and "auth boundary" open questions for the
organization-management concept specifically (embed, fronted by the existing session cookie); it
does not resolve those questions for ADR 0099's other candidate concepts (billing portal
redirect, coupon redemption), which remain open there.

## Consequences

- **Tower**: new `organization_membership_actor`; `organization_actor` loses `managers[]`/
  `successors`/direct role fields, gains `grantedRoles`/`seatLimit` (entitlement-only writes);
  `account.organizationId` removed. `organizations.ts`, `identities.ts` (invite redemption),
  `invites.ts`, `permissions.ts` (`requireOrganizationManager`/`Member`/`SelfOrOrganizationManager`)
  rewritten against membership records. `PERMISSION_CATALOG` loses `organization:manage`/
  `organization-billing:manage` — that mechanism is fully superseded by membership roles.
  Account-deletion cascade now revokes every membership record for the deleted account instead of
  triggering ADR 0090's per-manager succession search.
- **Keep**: `EntitlementScope` gains `{organization}`; `webhooks.ts` publishes a single event per
  organization-scoped change, no fan-out; `organization-manager-cache.ts`/
  `organization-reference-consumer.ts` (ADR 0098) are removed as dead code. Billing Portal access
  checks `billingAdmin`/`billingViewer` membership roles instead of the old permission.
- **Portcullis**: `enricher.rs`'s `AllowOutcome.organization_id: Option<String>` →
  `organization_memberships: Vec<OrganizationMembership>`; `jwt/internal.rs`'s `InternalClaims`
  and `allow_claims`/`degraded_claims` carry the same shape through unchanged/never-fabricated on
  a degraded token, mirroring `roles`/`permissions`' existing treatment.
- **authstar-clients**: `@bytepunx/authstar-core`/`@bytepunx/authstar-fastify` ship a major version
  for this breaking claims-shape change; every consumer (tower, keep, and tenant applications)
  bumps once published.
- **web**: new embeddable org-management route group; the existing `(admin)` organization screen's
  data model updates to read from membership records instead of `managers[]`.
- ADR 0090's per-manager succession design (individual successor per manager, operator-mediated
  incapacitation promotion) is retained conceptually but now operates on membership records
  (`successorAccountId` on the `manager`-holding membership) rather than `organization.successors`.
- ADR 0098's manager-fan-out entitlement design and its accepted backfill gap are fully retired —
  there is no fan-out left to backfill.
- Every tenant application already integrated against ADR 0090/0098's shape (loci, so far) needs
  its own claims-consumption code updated for the new `organizationMemberships` array.

## Related

- [ADR 0090](0090-organizations-shared-billing-administration-and-succession.md) (superseded)
- [ADR 0098](0098-organization-permission-lifecycle.md) (superseded)
- [ADR 0099](0099-hosted-tenant-brandable-ui-surfaces.md) (partially resolved for the
  organization-management concept; other candidate concepts remain open)
- [ADR 0069](0069-role-interpretation-is-application-owned.md) (the open-role-vocabulary
  precedent this ADR extends to organization scope, and the "authstar interprets some roles as
  its own access-control primitive" exception `manager`/`member`/`billingAdmin`/`billingViewer`
  rely on, same as `accounts:manage`)
- Story 006 (tower's `roleDefinition`/`rolesValid` mechanism, reused rather than duplicated)
