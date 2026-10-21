---
title: "Story 004: Applications and Providers Management"
updated: 2026-08-05
status: draft
---
# Story 004 — Applications and Providers Management

**Epic:** Identity & Access
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0030](../../adrs/0030-tower-api-surface.md)/
[ADR 0051](../../adrs/0051-web-applications-and-identity-access-screens.md) already
specify.** Per [ADR 0016](../../adrs/0016-application-layer-and-sso-scope.md),
[ADR 0020](../../adrs/0020-tenant-application-actors-and-secret-handling.md),
[ADR 0051](../../adrs/0051-web-applications-and-identity-access-screens.md),
[ADR 0053](../../adrs/0053-lifecycle-status-consolidation.md),
[ADR 0067](../../adrs/0067-tenant-creation-and-provisioning.md),
[ADR 0073](../../adrs/0073-provider-discovery-status-feedback.md),
[ADR 0082](../../adrs/0082-tower-actor-boundary-corrections.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `tenant`/`application`/`provider`
shapes and the `tenant.add-application`/`tenant.add-provider` command pattern.

---

## Summary

Grouped together because they share both halves of Story 001's pattern: creation goes through
`tenant` (a command producing a cross-type event), and reads can generally come straight from
`tenant`'s own already-reconciled `applications`/`providers` arrays rather than a separate
lookup. `_admin` is a real row like any other — never listed, but not special-cased at the data
layer.

---

## Applications

### `POST /tenants/{tenantSlug}/applications` — create

- [ ] Gated by `applications:manage`.
- [ ] Body: `{ slug, name, hosts, publicUrl, upstream, cors, exempt, auth, exposedProviders }`.
- [ ] Issues `tenant.add-application` against the `tenant` actor (Story 001) — **not** a direct
      create call. Rejects if `slug` already exists under this tenant (checked against
      `tenant.applications` at command-handling time — `consequent`'s single-writer-per-actor
      queue on `tenant` is what makes this check race-free against concurrent creates).
- [ ] **`slug: "_admin"` is rejected outright, always** — `_admin` is auto-provisioned exactly
      once, at tenant creation (ADR 0067), never through this route, by anyone, at any time. Not
      previously stated explicitly anywhere; worth being unambiguous about here.
- [ ] `publicUrl`'s host must be present in `hosts`, or the write is rejected (ADR 0051) — same
      validation as update, below.
- [ ] `exposedProviders` entries must already exist as active `provider` keys under this tenant
      (`{tenantSlug}:{name}`) — a reference to an unknown or removed provider is rejected, not
      silently accepted.

### `GET /tenants/{tenantSlug}/applications` — list

- [ ] Reads directly from `tenant.applications` (already fetched, already reconciled — no
      separate query). Excludes `_admin` (ADR 0051) and, by default, `status: "deleted"` entries
      (a query flag can include them, mirroring how other lifecycle lists in this design default
      to active-only with an opt-in to see everything).

### `GET /tenants/{tenantSlug}/applications/{appSlug}` — detail

- [ ] Resolves `appSlug` against `tenant.applications` to find the matching entry's `_id`, then
      returns that application's full current state — either the embedded copy (already
      reconciled at `tenant` fetch time) or a direct `fetch('application', _id)` if the handler
      wants the canonical read path; both are equivalent in content since `aggregateFrom`
      guarantees the embedded copy is current as of this same request.
- [ ] `404` (not `403`) if `appSlug` doesn't resolve, or resolves to a different tenant's
      application entirely (ADR 0030's cross-tenant-is-404 rule).

### `PATCH /tenants/{tenantSlug}/applications/{appSlug}`

- [ ] Gated by `applications:manage`. Resolve `appSlug` → `_id` via `tenant.applications` (as
      above), then issue the update **directly against the `application` actor's own `_id`** —
      not through `tenant` (Story 001: only creation routes through the parent).
- [ ] `slug` itself is immutable — not accepted in the body at all, not merely rejected if
      changed (ADR 0020: it's embedded in `application`'s identity and referenced elsewhere).
- [ ] `publicUrl`'s host must be present in `hosts` on every write that touches either field —
      rejects a mismatch (ADR 0051).
- [ ] `exposedProviders` writes validated the same way as creation (must reference existing,
      active provider keys under this tenant).

### `DELETE /tenants/{tenantSlug}/applications/{appSlug}`

- [ ] Soft alias for `PATCH { status: "deleted" }` (ADR 0051) — not a row removal. Same
      resolve-then-direct-update path as `PATCH` above.

---

## Providers

### `POST /tenants/{tenantSlug}/providers` — create

- [ ] Gated by `providers:manage`.
- [ ] Body: `{ name, discoveryUrl, clientId, clientSecret, scope }`. `clientSecret` is
      write-only — accepted here, never stored on the actor, pushed straight to signet under
      `tenant-<slug>-provider-<name>-client-secret` (or equivalent naming, consistent with this
      design's existing per-tenant secret-naming convention).
- [ ] Issues `tenant.add-provider` against `tenant` (Story 001) — same reasoning and same
      race-free uniqueness guarantee as `add-application`. Rejects if `name` already exists
      (active or removed) under this tenant — a removed provider's `name` isn't reusable, since
      its `key` (`{tenant}:{name}`) must stay a stable historical reference for anything that
      logged/audited against it.
- [ ] `discoveryStatus` starts `{ status: "ok", checkedAt: null, error: null }` — genuinely
      unknown until portcullis's own discovery cycle first reports on it (ADR 0073); `"ok"` here
      is an optimistic default, not a claim discovery has actually succeeded yet.

### `GET /tenants/{tenantSlug}/providers` — list

- [ ] Reads from `tenant.providers` directly, same pattern as applications. `clientSecret` is
      never present in any response, list or detail — it was never stored on the actor to begin
      with.

### `GET /tenants/{tenantSlug}/providers/{name}` — detail

- [ ] `key` is constructed directly as `{tenantSlug}:{name}` — no search needed (unlike
      `application`'s slug, `provider`'s route parameter **is** the second half of its actual
      business key). `404` if it doesn't resolve to an existing provider under this tenant.

### `PATCH /tenants/{tenantSlug}/providers/{name}`

- [ ] Gated by `providers:manage`. Issued **directly against the `provider` actor's own `key`**
      (constructed as above) — not through `tenant`.
- [ ] Accepts `discoveryUrl`/`scope`/`clientId` edits and, separately, `clientSecret` rotation
      (write-only, same discipline as creation) — either or both in one request.
- [ ] `name` is immutable (it's half of the actor's own key) — not accepted in the body.

### `DELETE /tenants/{tenantSlug}/providers/{name}`

- [ ] Soft alias for `PATCH { status: "removed" }` (ADR 0053) — same resolve-then-direct-update
      path as `PATCH`.
- [ ] **Two checks before allowing it, either one rejects the write** (ADR 0051/0067,
      Story 001):
  - [ ] No **active** `application.exposedProviders` (checked across every application under
        this tenant, from `tenant.applications`) still references this provider's key.
  - [ ] This isn't the **last** provider `_admin` itself exposes — `_admin`'s own
        `exposedProviders` is checked specifically, even though `_admin` is otherwise invisible
        to every other route in this story.

---

## Publishing to keep — application lifecycle events

- [ ] Every write that changes `application.status`, `application.hosts`, or creates a new
      application publishes the matching `application.<created|hosts-changed|suspended|deleted>`
      event (ADR 0047) — `{ tenant, application, name, status }`. Consumed by keep to maintain
      its own local, disposable reference cache (a plain projection, not a `consequent` actor)
      used to validate `planMapping.grantedRoles` at write time, since keep never calls tower
      directly for anything on the request path. This is the same outbound-event precedent tower
      already established publishing to herald (`contact.migrated`/`contact.purged`, ADR 0024) —
      not a new capability, just a third consumer of it.
- [ ] Providers have no equivalent publish requirement — keep's reference cache only tracks
      applications and role definitions (ADR 0047), since `planMapping.grantedRoles` never
      references a provider.

---

## Not Covered Here

- `POST /provider-discovery-status` — portcullis's own write-back call (ADR 0073), a completely
  separate portcullis-mTLS-only route, not part of this tenant-scoped surface at all. Already
  fully designed there; nothing about it changes based on this story.
- OIDC discovery itself (fetching `.well-known/openid-configuration`) — entirely portcullis's
  concern (Story 004 in `stories/proxy/`), unrelated to this tower-side CRUD.
