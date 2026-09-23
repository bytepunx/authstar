# Story 006 — Role Definitions

**Epic:** Identity & Access
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0047](../../decisions/0047-application-and-role-slug-validation.md)
already specifies.** Per [ADR 0024](../../decisions/0024-contact-lifecycle-sync-to-herald.md)
(the outbound-event precedent this reuses), [ADR 0047](../../decisions/0047-application-and-role-slug-validation.md),
[ADR 0051](../../decisions/0051-web-applications-and-identity-access-screens.md),
[ADR 0053](../../decisions/0053-lifecycle-status-consolidation.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `roleDefinition` shape,
[Story 004](004-applications-and-providers.md)'s `application` actor (referenced by
application-scoped definitions).

---

## Summary

The catalog that [Story 005](005-accounts-roles-and-permissions.md)'s role grants (and invite/
invite-code creation) validate against — a role must be *defined* here before it can be *granted*
anywhere. This is a deliberate, considered reversal of ADR 0017's original fully-opaque stance on
role names specifically to catch typo-driven silent failures (ADR 0047) — it does **not** revive
any tower-side interpretation of what a role *means* (ADR 0069 stands unchanged; this is a
registration check, not semantic interpretation).

---

## Routes

### `POST /tenants/{tenantSlug}/role-definitions` — create

- [ ] Gated by `roles:manage`.
- [ ] Body: `{ name, scope, description }` (`scope: 'tenant' | { application: '' }`).
- [ ] **If `scope` is application-scoped, the referenced application must exist and be
      non-deleted under this tenant** — checked once, at definition time, against
      `tenant.applications` (Story 001's embedded, already-current array — no separate lookup).
      This is the *only* place application validity is checked for role purposes; every
      downstream role-granting call site (account roles, invite, invite code) trusts that a
      `roleDefinition`'s existence already implies its application reference was valid when
      created (ADR 0047) — it is never re-validated at grant time.
- [ ] `key` is constructed positionally from `tenant`/`scope`/`name` (Story 001's corrected
      format) — `{tenant}:{name}` or `{tenant}:{appSlug}:{name}`. Rejects if that exact key
      already exists (`active` or `retired` — a retired definition's key isn't reusable, for the
      same historical-reference-stability reason `provider` names aren't reusable after removal,
      Story 004).

### `GET /tenants/{tenantSlug}/role-definitions` — list

- [ ] Filterable by `scope` and `status` (ADR 0030). Defaults to `active` only, with a flag to
      include `retired` — same convention as every other lifecycle list in this design.

### `GET /tenants/{tenantSlug}/role-definitions/{id}` — detail

- [ ] `{id}` **is** the actor's own composite `key`, URL-encoded — not a separate identifier
      (ADR 0051's clarification). `404` if it doesn't resolve under this tenant.

### `PATCH /tenants/{tenantSlug}/role-definitions/{id}`

- [ ] Gated by `roles:manage`. Only `description` is genuinely editable — `name`/`scope`/`tenant`
      are all embedded in the key itself and therefore immutable; changing any of them is
      definitionally creating a *different* role, not editing this one.
- [ ] `status: "retired"` is also reachable through this route (see `DELETE`, below — the same
      relationship as everywhere else in this design: `DELETE` is an alias, not a separate
      mechanism).

### `DELETE /tenants/{tenantSlug}/role-definitions/{id}`

- [ ] Alias for `PATCH { status: "retired" }` (ADR 0047/0053) — never a row removal. Retiring
      blocks only *future* grants; every existing `account.grantedRoles`/`trialRoles`,
      `invite.roles`, and `inviteCode.roles` entry referencing this `(name, scope)` stays intact
      as historical fact, untouched by this action.
- [ ] No check for "is this role currently granted to anyone" before allowing retirement —
      unlike `provider` removal (which actively blocks if still referenced), a retired role
      definition doesn't orphan anything; existing grants simply continue to mean what they
      already meant, since tower never re-validates a grant's `roleDefinition` after grant time.

---

## Publishing to keep — role-definition lifecycle events

- [ ] Every create and retire publishes `roleDefinition.<created|retired>` (ADR 0047) —
      `{ tenant, name, scope, status }`. Same consumer, same reasoning, same outbound-event
      mechanism as [Story 004](004-applications-and-providers.md)'s `application.*` events —
      keep's local reference cache needs both application *and* role-definition existence to
      validate `planMapping.grantedRoles` writes without ever calling tower directly.

---

## Not Covered Here

- The actual role/permission grant routes that validate against this catalog — Story 005.
- Keep's own consumption of these events (its reference cache, backfill-at-startup behavior,
  and `planMapping` write-path validation) — keep's own future story, not tower's concern beyond
  publishing correctly.
