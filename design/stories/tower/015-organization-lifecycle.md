# Story 015 — Organization Lifecycle: Manager Permissions and Billing-Access Delegation

**Epic:** Billing
**Repo:** tower
**Status:** Draft
**Fills a gap [ADR 0090](../../decisions/0090-organizations-shared-billing-administration-and-succession.md)
left as prose only. New — tower's side of the routes [ADR 0098](../../decisions/0098-organization-permission-lifecycle.md)
specifies.** Per [ADR 0018](../../decisions/0018-trial-roles-and-keep-boundary.md),
[ADR 0031](../../decisions/0031-keep-tower-entitlement-events.md),
[ADR 0090](../../decisions/0090-organizations-shared-billing-administration-and-succession.md),
[ADR 0098](../../decisions/0098-organization-permission-lifecycle.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `organization` shape (introduced by ADR
0090, not its own story — this is the first story to actually cover organizations end to end).

This story exists because no prior story ever documented organization management — only ADR
0090's prose did, and auditing the shipped code found that gap let a real correctness bug ship
silently (see ADR 0098's Context section).

---

## Organization Creation and Membership

### `POST /tenants/{tenantSlug}/organizations` — create

- [x] Already implemented (`routes/organizations.ts`, `createOrganization`). Creates the
      `organization` actor with the caller as the first `managers[]` entry, dispatches
      `account.join-organization` for the caller.
- [ ] **Gap being fixed**: also grants `organization:manage` to the caller in the same request
      (`account.grant-permission`), so the creator can actually pass `requireOrganizationManager()`
      afterward. Previously this never happened — the creator became a manager in name only.

### `add-manager` / `remove-manager`

- [x] Already implemented — mutate `organization.managers[]`.
- [ ] **Gap being fixed**: `add-manager` also grants `organization:manage` to the newly added
      account; `remove-manager` also revokes `organization:manage`, and revokes
      `organization-billing:manage` too if the removed account held it (ADR 0098).
- [ ] Both publish a new AMQP event on success — `organization.manager-added` /
      `organization.manager-removed` — `{ organizationId, tenant, accountId }`, same convention as
      `role-definitions.ts`'s `roleDefinition.created` publish call.

### Succession (`manager-succeeded`)

- [x] Already implemented — both trigger paths (voluntary last-manager departure, operator-mediated
      incapacitation claim) reach the same underlying transition.
- [ ] **Gap being fixed**: the promoted successor is granted `organization:manage` the same way a
      normal `add-manager` grants it; the departing manager's `organization:manage` (and
      `organization-billing:manage`, if held) are revoked the same way `remove-manager` revokes
      them.
- [ ] Publishes `organization.manager-succeeded` — `{ organizationId, tenant, departingAccountId,
      successorAccountId }`.

### Invite redemption with `organizationRole: 'manager'`

- [x] Already implemented (`identities.ts`'s `redeemInvite`) — dispatches
      `organization.add-manager` when the redeemed invite specifies it.
- [ ] **Gap being fixed**: also grants `organization:manage` to the redeeming account, same as the
      direct `add-manager` route does.

---

## Billing-Access Delegation

### `POST /tenants/{tenantSlug}/organizations/{organizationId}/members/{accountId}/billing-access` — grant

- [ ] Gated by `requireOrganizationManager()` — the caller must hold `organization:manage` for
      *this* organization (not merely any organization).
- [ ] `{accountId}` must already be a member of the organization (`account.organizationId ===
      organizationId`) — 404 if not.
- [ ] Grants `organization-billing:manage` (`account.grant-permission`, `scope: 'organization'`) to
      the target account. Does **not** imply `organization:manage` — matches ADR 0090's original
      framing that this is a narrower right a manager can delegate without also making someone a
      co-manager.

### `DELETE` — same path, revoke

- [ ] Same gating and membership precondition; revokes `organization-billing:manage` from the
      target account (`account.revoke-permission`). No-op (200, not an error) if the target didn't
      hold it — same idempotent-revoke convention `account.revoke-permission` already follows
      elsewhere in this codebase.

---

## Not Covered Here

- Entitlement fan-out for organization-scoped subscriptions (who receives roles when an
  organization's Stripe subscription activates) — that's keep's side of ADR 0098, not a tower
  route.
- A customer-facing (non-admin-dashboard) UI for any of this — `web`'s admin UI already covers the
  manager/member/billing-access management surface (this story's routes are what it calls). A
  brandable, hosted customer-facing surface is a separate, still-proposed idea
  ([ADR 0099](../../decisions/0099-hosted-tenant-brandable-ui-surfaces.md)).
- Backfilling `organization:manage` for any organization/manager that predates this story shipping
  — per ADR 0098, this is treated as a non-issue since the grant never worked before now, so there
  is no real prior state to reconcile.
