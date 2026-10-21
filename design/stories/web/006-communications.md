---
title: "Story 006: Communications"
updated: 2026-08-06
status: draft
---
# Story 006 — Communications

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screens [ADR 0054](../../adrs/0054-web-billing-and-communications-screens.md)
already specifies.** Per [ADR 0053](../../adrs/0053-lifecycle-status-consolidation.md),
[ADR 0054](../../adrs/0054-web-billing-and-communications-screens.md),
[ADR 0074](../../adrs/0074-herald-bounce-complaint-and-suppression.md),
[ADR 0078](../../adrs/0078-herald-template-branding.md).
**Depends on:** [herald Story 001](../herald/001-actor-definitions.md) through
[Story 005](../herald/005-webhooks-config-rotation-and-activity.md) — every route this screen
calls is already fully specified there.

---

## Communication Types

- [ ] List (active by default, deprecated visible via toggle), create, edit, deprecate — never
      a hard delete; historical `communication` records referencing a deprecated type remain
      meaningful (herald Story 003).

## Templates

- [ ] Per-type version list, create new version — **no edit, no delete** anywhere in this UI;
      immutable once created, matching herald's own route surface exactly (no `PATCH` exists to
      call even if this screen wanted one).
- [ ] **Gains a variable reference alongside the editor** (ADR 0078) — the available
      `templateData` fields for the selected `communicationType` (tenant/application branding
      fields, plus whatever type-specific fields that type defines) shown as documentation-in-
      context, not a live schema validator — herald itself doesn't enforce a `templateData`
      schema (herald Story 001/003), so this reference is guidance for whoever's authoring the
      template, not something the editor can programmatically check against.

## Communication History

- [ ] List (filterable by `contactId`/type/status/date range), detail (minimal audit fields
      only — never decrypted content inline), retry (`PATCH { status: "pending" }`), on-demand
      render (`GET .../render`, narrowly permissioned given the sensitivity).
- [ ] **A `status: "bounced"`/`"suppressed"`/complained entry links to the matching
      Suppressions/Opt-outs record** where one exists — an admin looking at a failed send
      shouldn't need to separately search Suppressions to understand *why* it failed; the
      cross-reference is a small, real usability addition this screen should make even though no
      ADR explicitly requires it (herald's `communication` record itself doesn't distinguish
      *why* it was suppressed, herald Story 001/004 — this screen resolves that "why" by looking
      up the contact in both `optOut` and `suppression` and showing whichever actually matches).

## Opt-outs

- [ ] View current opted-out categories, support-initiated add, remove/re-subscribe.

## Suppressions

- [ ] **A separate view from Opt-outs, not merged into it** (ADR 0074) — list (filterable by
      `reason`), manual add, admin-override remove. Blanket/deliverability-driven and category-
      scoped/consent-driven are different concerns that happen to share a `contactId` key; this
      screen keeps them visually and navigationally distinct for the same reason herald's own
      actors stay separate.

## Sending Configuration

- [ ] Provider, addresses, credential (write-only) — and, for API-based adapters specifically,
      `webhookSecret` (also write-only, ADR 0074). The webhook-secret field is only shown when
      `provider` is set to an API-based adapter (`ses`, etc.) — an SMTP-configured tenant never
      sees a field for a secret that would never be used, since SMTP bounce/complaint handling
      is explicitly out of scope (ADR 0074) and showing the field would imply a capability that
      doesn't exist for that provider choice.

---

## Not Covered Here

- The Billing section (keep) — [Story 005](005-billing.md).
