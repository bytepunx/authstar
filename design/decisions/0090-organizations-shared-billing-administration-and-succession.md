# ADR 0090: Organizations — Shared Billing Administration and Succession

- **Status:** Accepted
- **Date:** 2026-08-17
- **Affects:** tower, keep
- **Constrained by:** [ADR 0069](0069-role-interpretation-is-application-owned.md) (billing administration cannot be modeled as a `role` — see Context)

## Context

Stripe's Billing Portal — the hosted, self-service surface where a paying customer manages
their own payment method, views invoices, and cancels — has no integration in keep at all
(confirmed: zero references to `billing_portal` anywhere in the codebase or design history).
Building it surfaced a real gap underneath: `account` (ADR 0017) is a single-person unit —
one `contactId`, and every `identity` linked to it is the same person's alternate login method
(ADR 0070), never a different person. There is no tier between `account` and `tenant`. A B2B
customer who wants more than one person able to manage their own subscription — and wants to
control *which* of their own people can do that, without that person being able to further
delegate it — has nowhere to attach that today.

This cannot be modeled as a `role`. Roles are an open, app-owned vocabulary keep publishes
from plan mappings (ADR 0069) — tower asserts "this account holds role X" and is permanently
forbidden from interpreting what X means. "Can reach the Billing Portal for this
organization's subscription" is exactly the kind of thing ADR 0069 says must never be
authstar-enforced if it's a role. It has to be a `permission` — tower's own closed,
catalogued vocabulary — or it can't be enforced by keep's new route at all.

## Decision

### `organization` actor (tower) — the missing tier between `account` and `tenant`

```ts
{
  actor: { namespace: 'tower', type: 'organization', identifiedBy: 'organizationId',
           searchableBy: ['tenant'] },
  state: {
    tenant: '',
    name: '',                        // display name; not otherwise discussed, added because
                                      // no UI can list organizations without one
    managers: [],                    // accountId[] -- co-ownership, not a single owner
    successors: {},                  // { [managerAccountId]: successorAccountId }
    createdAt: '',
  }
}
```

Membership is **not** a list on `organization` — it's tracked the same way `identity.accountId`
already points at `account` (ADR 0017) rather than `account` holding a reverse list of
identity ids: `account` gains `organizationId: string | null`, and an organization's members
are found via `find('account', searchCriteria({ organizationId }))`. This avoids the two-actor
dual-bookkeeping problem the rest of this codebase already avoids everywhere else. One account
belongs to at most one organization at a time — same single-tenant-per-account constraint
`account.tenant` already has, extended one level.

### Two catalog permissions, not a scope object

`PERMISSION_CATALOG` (`tower/src/lib/permissions.ts`) gains two entries:

- `organization:manage` — full control: add/remove co-managers, invite/remove members, set
  your own successor.
- `organization-billing:manage` — narrow: reach keep's new Billing Portal session route for
  the organization's subscription. Does **not** imply `organization:manage` — a billing
  administrator cannot grant or revoke this right to anyone else; only a holder of
  `organization:manage` can.

Both are flat catalog strings needing no companion scope object, because — unlike
`billing:manage` (genuinely tenant-wide) — an account belongs to at most one organization, so
there's nothing to disambiguate: holding `organization-billing:manage` at all means "for my own
org." `PermissionGrant.scope` (currently `'tenant' | { application: string }`) gains a third
literal, `'organization'`, so these two grants are stored with `scope: 'organization'` rather
than misleadingly as `'tenant'`.

`InternalClaims` (portcullis's enrichment output, `@bytepunx/authstar-core`) gains one new flat
field: `organizationId?: string`, resolved from `account.organizationId` exactly the way
`accountId` already is. `organization:manage`/`organization-billing:manage`, when held, flow
into the existing flat `claims.permissions: string[]` array with no shape change there at all
— the single-org-per-account constraint is what makes this safe: a route checking
`claims.permissions.includes('organization-billing:manage') && claims.organizationId ===
params.organizationId` cannot be confused by a caller who manages a *different* organization,
since `organizationId` is a single value, not a set.

### A third scope tier in keep's billing `Scope`, distinct from the above

`keep/src/lib/scope.ts`'s `Scope` (`{ account: string } | { tenant: string }`) gains
`{ organization: string }`. Unlike tower's flat `'organization'` permission-scope literal,
this one **must** carry the actual id — a tenant can have many organizations, each with its own
Stripe subscription, and keep needs to know which one a given `customer`/`subscription`/
`planMapping` record belongs to. A subscription can now be purchased at three levels:
individual (`{account}`), shared across one organization's seats (`{organization}`), or
tenant-wide (`{tenant}`) — symmetric with how `{account}`/`{tenant}` billing already works
(ADR 0042), just with the new middle tier available.

### Managers: add, remove, and the last-manager guard

`add-manager({ accountId })` — actor event `manager-added`, idempotent (set-membership, same
style as `account.grant-role`). Route-layer precondition (not an actor-internal check, matching
this codebase's existing separation — cross-actor validation happens before dispatch, not
inside a consequent command): `accountId` must already be an org member.

`remove-manager({ accountId })` targets either a peer or the caller's own account (voluntary
departure) — no distinction in the command itself, since the org-continuity concern is the same
either way:

```
if accountId not in managers: no-op
else if managers.length === 1 and managers[0] === accountId:
  if successors[accountId] exists:  -> event 'manager-succeeded' (see Succession, below)
  else:                              -> reject: cannot remove the only remaining manager
                                        without a designated successor
else:
  -> event 'manager-removed'
```

Removing one co-manager out of several is a plain removal — succession only triggers when
removal would otherwise leave the organization with zero managers. `remove-member({ accountId
})` follows the same rule when the target is also a manager (dispatches the manager-removal
transition first); when the target is a plain member, it's a direct `organizationId` detach.

### Succession — per-manager, not one shared successor for the whole org

Each manager designates **their own** successor, not one successor for the org as a whole —
each manager is an individual person naming their own backup, so if one of three co-managers is
incapacitated, only their seat is replaced, not the whole board.

`set-successor({ successorAccountId })` / `clear-successor()` — always operates on the caller's
own entry in `successors`; a manager cannot set another manager's successor. Route-layer
precondition: the successor must already be an org member.

Two distinct trigger paths reach the same underlying `manager-succeeded` transition
(`managers = managers.filter(m => m !== departingId).concat(successorId); delete
successors[departingId]`), gated very differently, because one trigger condition is objectively
verifiable by the system and the other fundamentally is not:

- **Departure or account deletion** — both are events tower already observes directly (a
  manager voluntarily leaves; `account.status` transitions to `deleted`). Safe to promote
  automatically, no human involved. Account deletion's existing route gains a post-commit step:
  if the deleted account was a manager, look up its organizations and trigger succession the
  same way voluntary last-manager departure does; if no successor was designated, the
  organization is left with zero managers — a real, accepted edge case requiring operator
  intervention to resolve manually, no worse than the dangling-`stripeCustomerId`-after-deletion
  precedent keep's own code already lives with elsewhere.
- **Incapacitation or death** — cannot be verified by software, and letting a designated
  successor self-declare "the manager is dead, promote me" would be a direct impersonation
  path. This requires a human-mediated claim: `POST
  /operator/tenants/{tenantSlug}/organizations/{organizationId}/managers/{accountId}/
  promote-successor` — operator-bearer-token-authenticated (ADR 0030's operator tree), **no
  request body**. The URL identifies which manager is being succeeded; the successor itself is
  never a parameter, since it's already pre-designated — the operator's actual job is verifying
  incapacitation/death happened (an out-of-band, non-authstar process, same trust posture as
  ADR 0021/0067's operator-issued elevated invites), not deciding who replaces them. Unlike the
  departure trigger, this command works on **any** manager, not only a sole remaining one —
  incapacitation targets a specific person, regardless of how many co-managers remain.

### Invites extend to carry organization membership, kept separate from elevated bootstrap

`invite` (ADR 0019/Story 007) gains two fields: `organizationId: string | null` and
`organizationRole: 'member' | 'manager' | null`. Deliberately **not** reusing the existing
`permissions` field on `invite` (reserved for the operator-only elevated-bootstrap case, ADR
0021/0067) — organization membership is a narrower, well-defined structural fact a manager
already has standing authority over (the same authority `add-manager` grants directly), not a
general permissions grant that needs operator mediation.

New route: `POST /tenants/{tenantSlug}/organizations/{organizationId}/invites` — gated by
`organization:manage` for that org (or a tenant-admin override, `accounts:manage`), reusing
the existing invite-creation machinery with these two fields set. Redemption
(`identities.ts`'s `redeemInvite`, unchanged entry point) gains: if `invite.organizationId` is
set, dispatch `account.join-organization({ organizationId })` after the existing role/
permission grants, and if `invite.organizationRole === 'manager'`, also dispatch
`organization.add-manager({ accountId })`.

### keep's Billing Portal session route

`StripeClient` (`keep/src/lib/stripe-client.ts`) gains `createPortalSession(params: {
stripeCustomerId: string, returnUrl: string }): Promise<{ url: string }>`, implemented in
`RealStripeClient` via `stripe.billingPortal.sessions.create(...)` — the same
one-real-method-plus-one-fake-method pattern every existing `StripeClient` method already
follows, faked in `spec/lib/fake-stripe-client.ts` the same way `createCheckoutSession` is
(`bps_test_<n>` / `https://billing.stripe.test/<id>`, mirroring the existing `cs_test_<n>`
convention).

New route: `POST /tenants/{tenantSlug}/organizations/{organizationId}/portal-sessions` — gated
by `organization:manage` **or** `organization-billing:manage`, both additionally required to
match `claims.organizationId === organizationId` (a holder of either permission for a
*different* organization must not be able to reach this one — see the flat-claim reasoning
above). Resolves the organization's existing Stripe customer the same way
`checkout-sessions.ts` resolves an account's (`find('customer', ...)` filtered by
`scopesEqual(c.scope, { organization: organizationId })`); 404 if no customer exists yet
(Billing Portal requires an existing Stripe customer — unlike Checkout, there's no
implicit-creation fallback).

## Consequences

- Tower: new `organization` actor and routes (create, add/remove-manager, remove-member,
  set/clear-successor, org-scoped invites, operator-only promote-successor); `account` gains
  `organizationId`; `PERMISSION_CATALOG` gains `organization:manage` /
  `organization-billing:manage`; `PermissionGrant.scope` gains the `'organization'` literal;
  `InternalClaims`/enrichment gains `organizationId?: string`; the account-deletion route gains
  a post-commit succession check.
- Keep: `Scope` gains `{ organization: string }`; `StripeClient` gains `createPortalSession`
  (real + fake); new portal-sessions route; `customer`/`subscription`/`planMapping` can now be
  organization-scoped, not just account/tenant-scoped.
- Portcullis: none — enrichment already forwards whatever claims tower computes; no new
  portcullis-owned logic, just one more field passing through the existing pipe.
- An organization with zero managers (deletion of the sole manager with no successor
  designated) is a real, accepted terminal state requiring operator intervention — not
  automatically resolved, and not blocking this design.
- `web`'s admin UI needs a new organization-management screen (out of scope here, same as
  every other ADR that only specifies the API surface — see ADR 0051 for precedent).
- Account merging (explicitly deferred, ADR 0070) remains unrelated and still unresolved — an
  account joining or leaving an organization is not an identity-merge operation.

## Related

- [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0042](0042-single-account-billing-model.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0067](0067-tenant-creation-and-provisioning.md), [ADR 0069](0069-role-interpretation-is-application-owned.md), [ADR 0070](0070-self-service-identity-linking.md)
