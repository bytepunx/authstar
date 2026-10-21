# ADR 0021: CLI-Driven Operator Bootstrap for Admins and OIDC Providers

- **Status:** Accepted
- **Date:** 2026-07-24
- **Affects:** tower

> **Extended 2026-08-01:** tenant creation/provisioning, named below as explicitly out of scope,
> is resolved by [ADR 0067](0067-tenant-creation-and-provisioning.md) and
> [ADR 0068](0068-tenant-creation-ui-surfaces.md) — a new, separate `POST /tenants` route on its
> own pre-tenant ingress, not a change to the operator API this ADR defines.

## Context

`claude.md`'s original vision called for a CLI able to create admin accounts independent of a
third-party OIDC provider, so the system could be configured from cold start. That was written
before `invite`/`inviteCode` (ADR 0018/0019) and the `permissions`/secret-handling split (ADR
0020) existed — with those in place, the bootstrap problem no longer needs a parallel
username/password identity mechanism. Scope, per explicit direction: the CLI does **not**
provision tenants — it operates against tenants that already exist, and is used by the authstar
operating team (not tenant admins) to manage admin access and OIDC providers for them.

## Decision

### A bearer-token-gated operator API, mirroring signet's own `AdminService` pattern

Tower exposes a distinct API surface — cross-tenant, not the normal tenant-scoped/
`permissions`-gated one — authenticated by a bearer token, reachable via `kubectl port-forward`
for a human running the CLI locally. This deliberately reuses the exact shape signet already
built and the team already trusts for the same kind of access (human operator, not a workload),
rather than inventing a second pattern. Operator tokens are themselves signet-managed secrets
in tower's own bundle (ADR 0004/0011) — provisioned and rotated the same way as every other
secret tower holds, no new distribution mechanism.

### "Manage admins" = create an elevated invite, or directly mutate permissions

No new identity type is needed. Through the operator API, the CLI can:
- Create an `invite` or `inviteCode` (ADR 0018/0019) carrying elevated `permissions`, for an
  existing tenant. The recipient does a completely ordinary OIDC login and redemption — the
  existing identity-resolution/account-creation path is unchanged and untouched by any of this.
- Directly grant or revoke `permissions` on an *existing* account. This isn't just bootstrap —
  it's also the recovery path for a tenant that has locked itself out of its own admin access.

### "Manage OIDC providers" = the same secret-handling split, operator-invoked

The operator API can create/update a tenant's provider config, using exactly the mechanics ADR
0020 already established: non-secret metadata (`discoveryUrl`, `scope`) written to the
`tenant` actor as an ordinary event; `clientSecret` pushed directly to signet at set/rotation
time, never persisted in tower's own event log. The only difference from a normal admin doing
this is which credential authorizes the call.

### Explicitly out of scope

Tenant creation/provisioning via the CLI. This ADR assumes a tenant already exists by the time
an operator uses this tooling — how the very first tenant comes to exist is a separate,
unresolved question (likely `web`'s own onboarding design), not addressed here. **Resolved by
[ADR 0067](0067-tenant-creation-and-provisioning.md)/[ADR 0068](0068-tenant-creation-ui-surfaces.md).**

## Consequences

- Tower needs a distinct, bearer-token-authenticated API surface, separate from its normal
  tenant-scoped one, for this cross-tenant operator access.
- No changes to portcullis, and no new identity/auth mechanism in tower's domain model —
  bootstrap reuses `invite`/`inviteCode`/`permissions` entirely as already designed.

## Related

- [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0004](0004-signet-for-configuration-and-secrets.md), [ADR 0011](0011-minimizing-towers-signet-footprint.md)
