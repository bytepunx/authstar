# Story 003 — Communication Types and Templates

**Epic:** Sending
**Repo:** herald
**Status:** Draft
**New — herald's side of the routes [ADR 0034](../../decisions/0034-herald-api-surface.md)
already specifies.** Per [ADR 0025](../../decisions/0025-versioned-templates-and-encrypted-payloads.md),
[ADR 0029](../../decisions/0029-herald-payload-retention.md),
[ADR 0032](../../decisions/0032-per-tenant-sending-and-can-spam.md),
[ADR 0053](../../decisions/0053-lifecycle-status-consolidation.md),
[ADR 0078](../../decisions/0078-herald-template-branding.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `communicationType`/`template` shapes.

---

## Communication Types

### `POST /tenants/{tenantSlug}/communication-types` — create

- [ ] Gated by `communication-types:manage`. Body: `{ type, category, retentionDays }`. `key`
      constructed as `{tenantSlug}:{type}` (Story 001/ADR 0084) — rejects if that exact key
      already exists (`active` or `deprecated` — a deprecated type's `type` string isn't
      reusable, same historical-reference-stability reasoning as tower's `provider`/
      `roleDefinition`: existing `communication` records still reference it by that string).
- [ ] `retentionDays` defaults to `30` if omitted (ADR 0029).

### `GET /tenants/{tenantSlug}/communication-types` — list

- [ ] Defaults to `active` only, toggle to include `deprecated`.

### `GET`/`PATCH`/`DELETE /tenants/{tenantSlug}/communication-types/{type}`

- [ ] `{type}` in the URL is the bare type string — constructed into the full
      `{tenantSlug}:{type}` key internally (same route-parameter pattern as every other
      composite-keyed actor across this design).
- [ ] `PATCH` accepts `category`/`retentionDays` edits. `DELETE` is an alias for
      `PATCH { status: "deprecated" }` (ADR 0053) — historical `communication` records
      referencing a deprecated type remain fully meaningful, never orphaned.

---

## Templates

### `POST /tenants/{tenantSlug}/communication-types/{type}/templates` — create a new version

- [ ] Gated by `communication-types:manage`. Body: `{ subjectTemplate, bodyTemplate }`.
      **No edit, no delete, ever** — creating always produces a new version (ADR 0025); the
      highest version number is implicitly current, no separate "activate" step.
- [ ] `tenant` on the resulting `template` is this tenant's slug — **not** `null`. Global-default
      templates (`tenant: null`) are a system-seeded concept (shipped with herald itself, or
      created at tenant-provisioning time as a starting point), never created through this
      tenant-scoped route.
- [ ] No syntax validation of the mustache-style template content beyond "does it parse" —
      herald doesn't maintain a schema of what variables `templateData` will contain for a given
      `communicationType` (ADR 0078's `templateData` shape is a convention, not an enforced
      contract) — a template referencing a variable that never arrives just renders empty, not an
      error at creation time.

### `GET /tenants/{tenantSlug}/communication-types/{type}/templates` — list versions

- [ ] All versions, newest first — no default filtering (versions aren't a status-bearing
      lifecycle the way most lists in this design are; every version remains a legitimate
      historical artifact, since exactly *which* version rendered a given past `communication`
      is pinned on that record forever, Story 002).

### `GET /tenants/{tenantSlug}/communication-types/{type}/templates/{version}` — single version

- [ ] Straightforward fetch by the composite `(tenant, type, version)` lookup key (Story 001).

---

## Fallback resolution at send time (cross-reference, not a route)

- [ ] When the send worker (Story 002) looks up a template for a communication, it resolves the
      **highest version** matching `(tenant, communicationType, *)`; if the tenant has never
      created their own override, it falls back to the highest version matching
      `(null, communicationType, *)` — the global default. This fallback logic lives in the send
      worker's own lookup, not a route on this story's surface; named here so the two-tier
      tenant-override-vs-global-default relationship established in Story 001 has a concrete
      resolution order stated somewhere.

---

## Not Covered Here

- The rendering mechanism itself (mustache substitution, `templateData` conventions) — already
  fully specified in [Story 001](001-actor-definitions.md)/[Story 002](002-send-worker-and-retry.md).
- Seeding the built-in global-default templates herald ships with — an operational/deployment
  concern, not an API route.
