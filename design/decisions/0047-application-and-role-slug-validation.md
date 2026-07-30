# ADR 0047: Application and Role Slug Validation — Tower-Owned Role Catalog, Keep's Async Reference Cache

- **Status:** Accepted
- **Date:** 2026-07-30
- **Affects:** tower, keep, web
- **Resolves the gap surfaced in:** [ADR 0046](0046-tenant-owned-stripe-configuration.md)

## Context

`keep`'s `planMapping.grantedRoles` can reference an application slug and role name that don't
exist, silently producing an inert entitlement grant rather than an error — a real gap, since
`keep` never calls `tower` directly (ADR 0018) and so has no way to check. Application slugs
have a real source of truth in tower (the `application` actor, ADR 0016). Role names deliberately
don't — ADR 0017 made them opaque, unregistered tags specifically so tower never has to
interpret them. Fixing typo-driven silent failures for both means introducing a real role
catalog, a genuine reversal of that opacity for the sake of catching mistakes early.

## Decision

### `roleDefinition` — a new tower actor, the source of truth for valid role names

```ts
{
  actor: { namespace: 'tower', type: 'roleDefinition', identifiedBy: 'key' /* deterministic, see below */ },
  state: { tenant: '', name: '', scope: 'tenant' | { application: '' }, description: '', status: 'active' | 'retired' },
}
```

Business key is deterministic and composite — `{tenant}:{scope}:{name}` (`scope` serialized as
literal `tenant` or `application:{slug}`) — so validation is a direct `fetch()`, not a `find()`/
search, the same reasoning already applied to `identity`'s business key (ADR 0017). Created by a
tenant's own admin, gated by `roles:manage` (already named as an example permission grant when
`permissions` was introduced). Retiring sets `status: 'retired'` rather than deleting — existing
grants of an already-retired role stay intact as historical fact (the same "never destructively
rewrite history" instinct already applied to templates being versioned, invites being revoked
rather than deleted); retiring only blocks *future* grants.

Creating a `roleDefinition` with `scope: {application}` is where the application-slug check
actually happens — tower validates the referenced application exists at that moment. This means
application validity only needs checking once, at definition time, not re-checked at every
downstream role-granting call site, since granting a role transitively implies its definition
(and therefore its application reference) was already valid when created.

### Tower's own role-granting write paths now validate against the catalog

A deliberate tightening from ADR 0017's original fully-opaque stance, worth stating plainly as a
considered change, not an oversight: `POST /accounts/{accountId}/roles` (ADR 0030), and role
lists supplied when creating an `invite` or `inviteCode` (ADR 0018/0019), now validate the
referenced `(name, scope)` against an **active** `roleDefinition` at write time, rejecting with
a clear error otherwise. Invite/invite-code validation happens at *creation*, not redemption —
fail fast rather than let a bad reference sit dormant until someone tries to redeem it.

### New tower routes

```
GET, POST     /tenants/{tenantSlug}/role-definitions
GET, PATCH, DELETE  /tenants/{tenantSlug}/role-definitions/{id}   # DELETE retires, doesn't remove
```

### Tower publishes application and role-definition lifecycle events — the same precedent already established for herald, not a new capability

Tower already publishes outbound events for another service's benefit (`contact.migrated`/
`contact.purged` to herald, ADR 0024). This extends that same precedent with two new event
families, consumed by `keep`:

```ts
// application.<created|hosts-changed|suspended|deleted>
{ tenant: '', application: '', name: '', status: '' }

// roleDefinition.<created|retired>
{ tenant: '', name: '', scope: 'tenant' | { application: '' }, status: '' }
```

### Keep consumes these into a plain, non-consequent reference cache

Not a full actor — this is a pure, disposable, rebuildable projection of tower's own truth with
no independent business meaning, the same "not everything needs to be a domain-modeled actor"
call already made for `lookout` (ADR 0035). Two simple tables: known applications, known active
role definitions, both tenant-scoped.

A narrow, one-time (and periodically re-run as a safety net) **backfill** from tower at keep's
own startup seeds this cache — the one deliberate, narrowly-scoped exception to "keep never
calls tower directly." It's fundamentally different from the live-per-write-time call this
design explicitly avoided: it never gates any specific request, runs with retry/backoff, and
keep starts serving requests regardless of whether it's completed.

### Keep's own plan-mapping writes validate against this local cache

`POST`/`PATCH` on `/tenants/{tenantSlug}/plan-mappings` rejects with a clear `4xx` if any
`grantedRoles` entry references an application or role-definition not present (and active) in
keep's local reference cache — this is the actual payoff, an inert grant becomes a rejected
write instead.

### `web` gets live dropdowns — prevents the typo before it's typed

`web`'s plan-mapping editor (and, for the same reason, its invite/invite-code/account-roles
editors) populate application and role pickers from tower's `GET` endpoints directly — no new
mechanism needed for applications (already exists, ADR 0030), a small new one for role
definitions (above). This catches the mistake at the moment of entry, which is strictly better
than any server-side rejection after the fact.

### Portcullis is entirely unaffected

Portcullis's internal-token merge logic (ADR 0018/0043) only ever sees roles tower's enrichment
already returned — which, by construction, only ever contains grants that were valid at grant
time. No story changes needed.

## Consequences

- New tower actor (`roleDefinition`), two new routes, and validation added to three existing
  write paths (`account.roles`, `invite`, `inviteCode`).
- New RabbitMQ event types tower publishes, consumed by a new `keep` component (small consumer
  + two reference tables + a startup backfill).
- Keep's plan-mapping write path gains a validation step.
- `web`'s plan-mapping, invite, invite-code, and account-roles editors should all use live
  dropdowns rather than free-text entry for application/role fields.
- **New required admin workflow step**: a role must be *defined* (via the new catalog) before
  it can be *granted* anywhere — `web` should nudge for this during application setup rather
  than let an admin discover it only when a grant attempt fails.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0024](0024-contact-lifecycle-sync-to-herald.md) (the tower→herald precedent this mirrors), [ADR 0030](0030-tower-api-surface.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md) (non-actor service precedent), [ADR 0046](0046-tenant-owned-stripe-configuration.md)
