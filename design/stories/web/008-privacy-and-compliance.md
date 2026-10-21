---
title: "Story 008: Privacy & Compliance"
updated: 2026-08-06
status: draft
---
# Story 008 — Privacy & Compliance

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screens [ADR 0055](../../adrs/0055-web-privacy-compliance-screens.md)/
[ADR 0057](../../adrs/0057-web-data-export-screen.md) already specify.**
Per [ADR 0055](../../adrs/0055-web-privacy-compliance-screens.md),
[ADR 0056](../../adrs/0056-gdpr-data-export.md),
[ADR 0057](../../adrs/0057-web-data-export-screen.md),
[ADR 0075](../../adrs/0075-stuck-erasure-request-monitoring.md).
**Depends on:** [tower Story 008](../tower/008-contacts-erasure-and-export.md) — every route
this screen calls, and this story's own server-side export assembly (`web`'s one genuinely
cross-service orchestration).

---

## Contacts

- [ ] **Exact-lookup only, never a browse/list** — a search box takes an email, calls tower's
      `GET /contacts?email=...`, and returns at most one result. There is no "browse all
      contacts" screen anywhere in this design, deliberately (tower Story 008) — this screen's
      own layout should make that a structural fact (no empty-state list, no pagination
      controls), not something a user discovers by trying to load a list that was never going to
      populate.
- [ ] Detail view: plaintext `email`/`name` (gated by `contacts:read`), linked-account preview
      (`status`/`grantedRoles`/`trialRoles`/`createdAt`), `name` edit (`PATCH`, same permission).
- [ ] **"Erase Data" and "Export Data" actions live side by side on this same detail view** (ADR
      0057) — no separate screens for either. Erase requires heavy, explicit confirmation
      (irreversible, cross-service cascade, gated by the separate `contacts:erase` permission —
      an admin holding only `contacts:read` sees the Export action but not Erase at all, not a
      disabled Erase button).

## Erasure Requests

- [ ] List (paginated, filterable by status/date range), detail (`status`, `acknowledgedBy`,
      `expectedServices` — diffed against each other by this screen, not pre-diffed by tower).
- [ ] **A visual staleness flag, computed client-side from `requestedAt`** (ADR 0075) — no new
      tower field, just "pending longer than {N} hours" highlighted distinctly (default `N=72`,
      matching steward's own operator-facing default for consistency, though this screen's
      threshold is purely cosmetic/informational — it doesn't change what tower returns, unlike
      steward's cross-tenant view, which genuinely re-queries on threshold change).

## Export Data

- [ ] The "Export Data" action ([Erase Data]/[Export Data] on the Contact detail view, ADR 0057)
      triggers `web`'s own server-side assembly — calls tower/keep/herald/chronicle's four
      export endpoints **in parallel**, from `web`'s SvelteKit server layer (never the browser
      directly), and streams the combined JSON straight to the browser as a download.
- [ ] **Partial failure is shown, never hidden** — if one service's call fails or times out, the
      downloaded JSON includes every section that succeeded, with the failed one explicitly
      marked `"unavailable, retry to include"` (ADR 0056) — this screen's own success/failure
      messaging to the admin should say the same thing plainly ("export downloaded — herald's
      section was unavailable, retry to include it") rather than a bare success toast that hides
      a partial result.
- [ ] Gated by `contacts:export` — a separate, broader permission than `contacts:read`, visible
      as its own distinct action rather than folded into the same gate as viewing the contact.

---

## Not Covered Here

- The self-service `/me/export` path and its embeddable widget — a future widget-library story;
  this story's export assembly logic is the same server-side code both paths share, but the
  self-service entry point isn't part of `_admin` at all.
