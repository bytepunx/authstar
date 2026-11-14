---
title: "Story 004: Activity and Stuck Erasure Requests"
updated: 2026-11-14
status: draft
---
# Story 004 — Activity and Stuck Erasure Requests

**Epic:** Operator Console
**Repo:** steward
**Status:** Draft
**New — steward's side of the screens [ADR 0048](../../adrs/0048-steward-ux.md)/
[ADR 0075](../../adrs/0075-stuck-erasure-request-monitoring.md) already specify.**
**Depends on:** [tower Story 010](../tower/010-activity-feed.md)'s operator-scoped activity
route, [tower Story 013](../tower/013-operator-api.md)'s `GET /operator/erasure-requests/stuck`.

---

## Activity View — within a tenant's operator context

- [x] Read-only recent-activity view, calling `GET /operator/tenants/{tenantSlug}/activity`
      ([tower Story 010](../tower/010-activity-feed.md)) — permission grants/revokes, invite/
      invite-code issuance, provider changes, surfaced from the same shared `{ timestamp,
      actorType, actorId, eventType, summary }` shape every other activity feed in this design
      uses.
- [x] Each entry shows its `actingAs` label where present — the self-reported attribution captured
      durably on the event itself at write time (tower Story 010), displayed plainly as
      self-reported, not verified identity, per ADR 0048's own stated limitation. Entries from
      before this mechanism existed, or produced by the tenant-scoped route rather than the
      operator one, simply show no `actingAs` — not blank-as-error, just genuinely absent data.

---

## Stuck Erasure Requests — steward's first genuinely cross-tenant view

- [x] **Not** reached from within a single tenant's operator context — this is a top-level view,
      alongside Tenant Search, since it spans every tenant at once by design (ADR 0075).
- [x] Calls `GET /operator/erasure-requests/stuck?olderThanHours=` — the threshold is an
      **operator-adjustable control on this screen** (a number input, default `72`), not a fixed
      display — re-queries on change rather than filtering a fixed result set client-side, since
      the threshold changes which records tower even returns (tower Story 013).
- [x] Per stuck request: `tenant`, `contactId`, `requestedAt`, and **which specific services in
      `expectedServices` haven't acknowledged** — the diagnostic detail an operator actually needs
      to know *what to go fix*, not just that something is old. Grouping/sorting by "which service
      is missing" (rather than by tenant or age) is a reasonable default view, since the
      actionable pattern is almost always "one service silently stopped consuming its queue
      everywhere," not "one tenant has a problem."
- [x] Steward also shows a Stuck Erasures section on the tenant's operator page (`/tenants/[slug]`),
      decided on TH-0016 (S-0013). The section filters tower's cross-tenant list to that tenant
      at the default 72 hours and links to the top-level view. The top-level view stays where an
      operator changes the threshold and sees the pattern across tenants. Both render the same
      rows (`steward/src/lib/components/StuckErasureRows.svelte`). The top-level view is at
      `/erasure-requests/stuck`, linked from the header nav. It applies the threshold when the
      operator submits it, and it refuses a threshold that is not a positive whole number
      without calling tower.

---

## Not Covered Here

- Per-tenant erasure-request detail beyond what's stuck — that's `web`'s own Privacy &
  Compliance screen (ADR 0055), tenant-scoped, not steward's concern.
- Herald Keys and tenant key rotation — [Story 005](005-key-rotation-screens.md).
