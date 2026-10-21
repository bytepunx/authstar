---
title: "Story 015: Organization Lifecycle: Multi-Org Membership and an Open Role Catalog"
updated: 2026-08-29
status: shipped
---
# Story 015 — Organization Lifecycle: Multi-Org Membership and an Open Role Catalog

**Epic:** Billing
**Repo:** tower
**Status:** Shipped
**Per:** [ADR 0100](../../adrs/0100-organization-membership-and-open-role-catalog.md) (supersedes
[ADR 0090](../../adrs/0090-organizations-shared-billing-administration-and-succession.md)/
[ADR 0098](../../adrs/0098-organization-permission-lifecycle.md), which this story's own first
draft was written against — see git history for that version).
**Depends on:** [Story 001](001-actor-definitions.md), [Story 006](006-role-definitions.md)'s
`roleDefinition`/`rolesValid` mechanism (reused for organization-scope roles, not duplicated).

Rewritten in full once ADR 0100 replaced the manager-list/two-catalog-permission model this
story's first draft covered with multi-org membership and an open, catalog-validated org-role
vocabulary.

---

## Organization Roles — An Open Catalog, Not a Fixed Enum

- [x] `roleDefinition`'s `scope` accepts `'organization'` alongside `'tenant'`/`{application}`,
      keyed `${tenantSlug}:organization:${name}`.
- [x] Four defaults seed per tenant at provisioning time — `manager`, `member`, `billingAdmin`,
      `billingViewer` — and are protected from retirement (`role_definition_actor.ts`'s `retire`
      command rejects these four specifically).
- [x] A tenant can define further org-scope roles the same way it defines app-scope ones
      (`POST /tenants/{tenantSlug}/role-definitions`).

## `organizationMembership` — the Sole Source of Truth for Standing

- [x] One record per (account, organization) pair, `searchableBy: ['tenant', 'accountId',
      'organizationId']` — an account can hold any number of these. `roles` is validated against
      the org-scope role catalog at write time (`organizationRolesValid`); every membership always
      includes `'member'`.
- [x] `organization` itself carries only `{organizationId, tenant, name, grantedRoles, seatLimit}`
      — `grantedRoles`/`seatLimit` populated only by keep's entitlement events
      (`lib/entitlement-consumer.ts`), never by any route in this file.

### `POST /tenants/{tenantSlug}/organizations` — create

- [x] Self-service, no permission required. Creates the organization and a membership record with
      `roles: ['manager', 'member']` for the caller. No "already belongs to an organization" block
      — membership is many-to-many now.

### Roster and role management

- [x] `GET .../organizations/{organizationId}/members` — any member can list the full roster
      (gated by `requireOrganizationMember`).
- [x] `POST .../organizations/{organizationId}/members` — a manager adds an existing account
      directly (`{accountId, roles?}`), gated by the organization's seat limit (`null` means one
      seat, the creator only).
- [x] `POST`/`DELETE .../members/{accountId}/roles[/​{role}]` — a manager grants/revokes *any*
      org-scope role for an existing member, validated against the catalog. This one generic pair
      replaces ADR 0098's separate billing-access delegation route entirely — `billingAdmin`/
      `billingViewer` are just roles now.
- [x] `DELETE .../members/{accountId}` — removes a membership entirely (self-service for voluntary
      departure, or a manager acting on someone else).

### Succession

- [x] `PUT`/`DELETE .../members/{accountId}/successor` — strictly self-only, no manager or
      tenant-admin override.
- [x] `guardLastManager` (shared by role-revoke and full-removal): if the target is the
      organization's only active manager, requires a designated successor (whose own membership
      must still be active) before allowing the change — auto-promotes the successor's membership
      to `manager` when it fires.
- [x] `POST /operator/.../members/{accountId}/promote-successor` — the incapacitation/death path,
      unreachable by any self-service caller. Unlike the guard above, works on *any* manager, not
      only a sole remaining one; the departing membership loses `manager` standing but stays a
      plain member.

### Invites

- [x] `POST /tenants/{tenantSlug}/organizations/{organizationId}/invites` — `organizationRole` is
      any valid org-scope role name (not a fixed `member`/`manager` enum), and accepts either
      `contactId` or `email` (find-or-create), matching the general invite route's own fallback.
- [x] Redemption (`identities.ts`) creates a membership record gated by the same seat-limit check
      `addMember` uses — silently skips on exhaustion, per Story 007's "mismatch is not an error"
      posture, never failing the whole login.

### Account deletion

- [x] Revokes every active membership across every organization the deleted account belonged to,
      with best-effort succession per membership (never blocking the deletion itself). An
      organization left with zero managers is a real, accepted terminal state requiring operator
      intervention.

---

## Not Covered Here

- Entitlement publishing for organization-scoped subscriptions (keep's side) — see ADR 0100's own
  Decision section and `keep`'s `webhooks.ts`.
- The embeddable, brandable customer-facing UI for this surface — see
  [ADR 0099](../../adrs/0099-hosted-tenant-brandable-ui-surfaces.md) and its concrete
  implementation in `authstar/web`'s `(embed)` route group.
