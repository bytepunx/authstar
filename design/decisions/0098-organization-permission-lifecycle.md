# ADR 0098: Organization Permission Lifecycle and Entitlement Fan-Out

- **Status:** Accepted
- **Date:** 2026-08-25
- **Affects:** tower, keep
- **Supersedes:** none (extends [ADR 0090](0090-organizations-shared-billing-administration-and-succession.md) — that ADR is not being reversed, this closes gaps it left open)

## Context

ADR 0090 introduced the `organization` actor, its `managers[]` array, and the two catalog
permissions `organization:manage`/`organization-billing:manage`. Auditing the shipped
implementation (while researching an unrelated feature) turned up two gaps that mean the feature
never actually worked end-to-end for a real account:

1. **No code path ever issues the `organization:manage` `PermissionGrant`.** `organization.create`
   sets the creator as the first `managers[]` entry, and `organization.add-manager` extends that
   array — but membership in `managers[]` and holding the `organization:manage` permission
   (`account.permissions: PermissionGrant[]`) are two independently-tracked facts that nothing ever
   links. `requireOrganizationManager()` checks the permission, not array membership, so no real
   manager's session has ever been able to pass it. This was masked in tower's test suite, which
   hand-signs `organization:manage` directly into JWT fixtures rather than exercising the real
   grant path — and it silently broke the `web` admin UI for organization management (built after
   ADR 0090, despite that ADR calling such a UI out of scope), since that UI is nav-gated on
   holding the permission.
2. **`organization-billing:manage` delegation was never built**, only described in prose ("a
   billing administrator cannot grant or revoke this right to anyone else; only a holder of
   `organization:manage` can"). No route exists for a manager to grant or revoke it for a peer
   member.
3. Separately, keep's `webhooks.ts` has carried a documented, deliberate gap since ADR 0090:
   `isEntitlementScope` returns `false` for `{organization}` scope, so an organization-scoped
   subscription activates in Stripe but grants no roles to anyone — "who gets the roles" was
   explicitly left undesigned. This ADR resolves it: **the organization's current managers**, not
   every member. Managers are the accounts responsible for administering the subscription (ADR
   0090's own framing), so they're the natural recipients of whatever the subscription's plan
   mapping grants — the same accounts who need `organization:manage` to keep managing it going
   forward.

## Decision

### Manager membership and `organization:manage` change atomically

Every route that adds a manager (`organization.create`'s creator, `organization.add-manager`,
org-invite redemption with `organizationRole: 'manager'`, and a succession promotion) also grants
`organization:manage` to that account in the same request. Every route that removes a manager
(`organization.remove-manager`, succession's departing-manager side) also revokes
`organization:manage` from that account, **and** revokes `organization-billing:manage` if that
account held it — a removed manager shouldn't retain billing-portal access as a stray leftover
permission nobody remembers to clean up.

### New delegation route

`POST` / `DELETE /tenants/{tenantSlug}/organizations/{organizationId}/members/{accountId}/billing-access`,
gated by `requireOrganizationManager()`, target must already be an organization member (404
otherwise). This is the concrete route ADR 0090's prose described but never specified.

### Entitlement fan-out: organization scope resolves to its managers, event-driven

Keep's `EntitlementScope`/`EntitlementEvent`/tower's `entitlement-consumer.ts` are **not**
changed — they remain `{account}|{tenant}` only. Instead, keep resolves `{organization: id}` into
the organization's current manager list *before* constructing any entitlement event, then publishes
one event per resolved manager (`scope: {account: managerId}`), each with its own sequence number.
This keeps every downstream consumer unaware organizations exist at all.

To resolve that manager list without a new synchronous keep→tower call, tower publishes three new
AMQP events — `organization.manager-added`, `organization.manager-removed`,
`organization.manager-succeeded` — the same way it already publishes `roleDefinition.created`/
`application.created` etc. Keep consumes them into a local cache
(`organization-reference-consumer.ts`, mirroring the existing `role-reference-consumer.ts`), which
`webhooks.ts` reads synchronously when resolving fan-out targets.

**Accepted limitation, not solved here:** unlike roles/applications (which have
`role-reference-backfill.ts`'s one-time HTTP backfill against an unauthenticated tower route for
cold starts), there is no equivalent backfill for organizations in this pass. A freshly-started
keep process has an empty organization-manager cache and only learns about managers as new
`manager-added` events occur going forward. This is acceptable now because gap #1 above means the
feature has never worked end-to-end for a real account yet — there is no real pre-existing
manager-list data this would strand. If/when that stops being true, add an
`organization-reference-backfill.ts` mirroring the existing pattern; it will need a tower-side
decision (a new unauthenticated route, mirroring the one existing exception role-reference-backfill
already carved into "keep never calls tower directly," or an operator-token-authenticated call)
that this ADR deliberately defers rather than deciding preemptively.

Two routes are explicitly **not** widened by this ADR: `publishSeatLimitIfSet` stays tenant-only
(a separate, already-deliberate restriction, unrelated to who receives *roles*), and `trials.ts`
continues to reject `{organization}` scope at the schema level (a trial can exist before an
organization's subscription — and therefore its manager list — is even fully settled; that's a
distinct question this ADR doesn't attempt to answer).

## Consequences

- Tower: `organizations.ts`'s create/add-manager/remove-manager handlers (and `identities.ts`'s
  invite redemption) each gain a `grant-permission`/`revoke-permission` call; a new billing-access
  delegation route; three new AMQP publish call sites.
- Keep: a new `organization-reference-consumer.ts` + fastify decoration
  (`app.organizationManagers`); `webhooks.ts`'s `publishRoleEvents`/`onSubscriptionActivated` gain
  a fan-out-resolution step for `{organization}` scope.
- `web`: the organization detail page gains a billing-access grant/revoke UI section, now that the
  underlying route exists.
- Tower's test suite needs to stop relying on hand-signed `organization:manage` JWT fixtures for at
  least the flows that are supposed to prove the real grant chain works, or those tests continue to
  mask exactly the class of bug this ADR fixes.
- The backfill gap above is real and explicitly deferred, not resolved — flagged so it isn't
  mistaken for an oversight later.

## Related

- [ADR 0090](0090-organizations-shared-billing-administration-and-succession.md) (the organization
  actor, `managers[]`, the two catalog permissions this ADR wires up)
- [ADR 0031](0031-keep-tower-entitlement-events.md) (`EntitlementScope`, unchanged by this ADR)
- [ADR 0047](0047-application-and-role-slug-validation.md) (the `role-reference-backfill.ts`
  precedent this ADR's accepted limitation explicitly declines to duplicate for organizations yet)
