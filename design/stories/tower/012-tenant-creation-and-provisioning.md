---
title: "Story 012: Tenant Creation and Provisioning"
updated: 2026-08-05
status: draft
---
# Story 012 — Tenant Creation and Provisioning

**Epic:** Tenant Lifecycle
**Repo:** tower
**Status:** Draft
**New — tower's side of the mechanism [ADR 0067](../../adrs/0067-tenant-creation-and-provisioning.md)
already specifies.** Per [ADR 0002](../../adrs/0002-multi-tenant-architecture-and-key-management.md),
[ADR 0009](../../adrs/0009-tenant-data-via-syncbundle-no-github.md),
[ADR 0011](../../adrs/0011-minimizing-towers-signet-footprint.md),
[ADR 0021](../../adrs/0021-cli-operator-bootstrap.md),
[ADR 0022](../../adrs/0022-herald-communications-service.md),
[ADR 0023](../../adrs/0023-pii-isolation-via-hashed-contact-records.md),
[ADR 0044](../../adrs/0044-web-surfaces-and-distribution-model.md),
[ADR 0067](../../adrs/0067-tenant-creation-and-provisioning.md).
**Depends on:** [Story 004](004-applications-and-providers.md)'s `tenant.add-application`/
`tenant.add-provider` command pattern, [Story 007](007-invites-and-invite-codes.md)'s invite
creation, [Story 011](011-tenant-management-and-key-rotation.md)'s key-material handling.

---

## `POST /tenants` — its own auth model, its own ingress

- [ ] Not on the tenant-scoped tree, not on the operator tree — a third, standalone surface. Two
      valid callers: the operator bearer token (always allowed), or unauthenticated (only when
      the installation-level `provisioning.selfServiceEnabled` flag is on, default `false`).
- [ ] Reachable only via tower's own direct ingress, bypassing portcullis entirely — this
      request is inherently pre-tenant, and portcullis's whole gate (Story 013 on the proxy side)
      is built tenant-resolution-first; there's no `Host` to resolve a tenant from yet (ADR 0067).
- [ ] Installation-level config, tower's own bundle, operator-configurable via `steward`:

```yaml
provisioning:
  selfServiceEnabled: false
  baseDomain: authstar.app
  defaultProvider: { name: '', clientId: '', discoveryUrl: '', scope: [] }
```

  plus a `default-provider-client-secret` secret. `selfServiceEnabled` defaults `false` — a
  self-hosted install almost certainly doesn't want the public internet provisioning tenants on
  its own infrastructure.

- [ ] Body: `{ slug, name, adminEmail, adminHost? }`. `adminHost` (override for `_admin`'s host)
      is accepted **only** from an operator-authenticated caller — a self-service caller never
      supplies it, since by definition they have no domain infrastructure ready yet (ADR 0067).

---

## Provisioning sequence

- [ ] **1. Validate `slug`.** Format: the same delimiter-safe character set used everywhere else
      in this design (application/role slugs, ADR 0002/0047). Uniqueness: free — `tenant`'s own
      business key (`slug`) makes a duplicate a plain `consequent` create-conflict, not a
      separate pre-check.
- [ ] **2. Create the `tenant` actor directly** — `consequent.handle('tenant', slug, 'tenant.create',
      {...})`, the one and only place in this whole design a `tenant` command is issued against
      an instance that doesn't exist yet (every other tenant-affecting write, Story 001/004,
      targets an already-existing `tenant`).
- [ ] **3. Seed the default provider** — issue `tenant.add-provider` (Story 004's exact command
      pattern) using the installation's `defaultProvider` non-secret fields, and push the
      **same** `default-provider-client-secret` value to signet under this new tenant's own
      provider-secret name. Copied, not referenced (ADR 0067's own named trade-off: rotating the
      installation default later does **not** retroactively update tenants that already copied
      it — accepted, not solved here).
- [ ] **4. Auto-create `_admin`** — issue `tenant.add-application` (Story 004's pattern) with
      `slug: "_admin"` (the one caller in this whole design allowed to use that slug — every
      *other* creation path rejects it outright, Story 004), `hosts: ["admin.{slug}.{baseDomain}"]`
      (or the operator-supplied `adminHost`), `exposedProviders: [the seeded provider's key]`.
- [ ] **5. Generate and push the four per-tenant secrets** (Story 001/011's key-handling
      discipline, generation 1 for each — this is the *first* rotation-shaped write, not a
      special case of it): session signing keypair, internal signing keypair, `identity-hash-key`
      generation 1 → **portcullis's** bundle. `contact-hash-pepper` → **tower's own** bundle —
      confirming tower's elevated `SyncBundle` access (ADR 0011) covers writing to its own bundle,
      not only portcullis's (ADR 0067's own clarification of a previously-implicit point).
- [ ] **6. Issue the first admin's invite** — reuses [Story 007](007-invites-and-invite-codes.md)'s
      exact `invite` creation, targeting `adminEmail`, with `permissions` set to full tenant
      `permissions` (the elevated-bootstrap case that field exists for) and `application: null`
      (tenant-wide — lands on `_admin` via the normal login flow, not a special-cased target).
      **No new invite mechanism** — this is that route's own logic, called internally rather than
      via its own HTTP request.
- [ ] **7. Publish through herald's existing `comms.transactional.invite-sent`** (ADR 0022) —
      already reused unchanged for the ordinary invite case (Story 007); nothing new here either.

- [ ] **Any step 3–7 failure after step 2 succeeded leaves a real, partially-provisioned
      `tenant`** — this story does not attempt cross-step rollback (`consequent` has no
      multi-actor transaction primitive to build one on, and a rollback here would just be
      un-deleting/re-deleting actors this design otherwise never deletes). The operator-facing
      response reports exactly which step failed; retrying provisioning for an already-created
      `slug` is expected to be **idempotent from step 3 onward** — each step's own create-or-skip
      logic (provider/application slug uniqueness, secret-push idempotency) makes a retry safe
      rather than needing a distinct "resume" code path. Not previously stated anywhere; a real
      operational gap worth naming plainly rather than leaving implicit.

---

## Response

```
{ slug: '', adminHost: '' }
```

No secrets, obviously; no invite token (the invite was already dispatched via email, not
returned to the caller — same discipline as every other invite issuance).

---

## Not Covered Here

- Rate limiting/abuse prevention on the self-service path — named as a requirement (ADR 0067),
  not designed here or anywhere yet.
- The public signup page and `steward`'s create-tenant screen — [ADR 0068](../../adrs/0068-tenant-creation-ui-surfaces.md)'s
  concern, `web`'s and `steward`'s own future stories.
- Tenant deletion — remains explicitly out of scope (ADR 0021).
