---
title: "Story 002: Overview"
updated: 2026-08-06
status: draft
---
# Story 002 — Overview

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screen [ADR 0061](../../adrs/0061-web-overview-screen.md)
already specifies.** Per [ADR 0060](../../adrs/0060-activity-feed-and-revenue-summary.md),
[ADR 0061](../../adrs/0061-web-overview-screen.md).
**Depends on:** [Story 001](001-app-shell-auth-and-section-gating.md)'s per-tile gating pattern,
[tower Story 010](../tower/010-activity-feed.md)'s activity route, chronicle
[Story 002](../chronicle/002-reporting-api.md)'s active-users report, keep's revenue-summary
route (keep's own future story).

---

## Summary

The landing page — three independently-gated tiles, not a BI dashboard. Deliberately lean: each
tile links out to its own fuller section rather than trying to be a complete view in itself.

---

## Tiles

### Active Users

- [ ] Gated by `analytics:read` — absent entirely if not held, not shown empty/disabled.
- [ ] Calls chronicle's active-users report ([chronicle Story 002](../chronicle/002-reporting-api.md)),
      current period only, tenant-wide (no `application` filter) — "one mechanism, two
      renderings" shared with the full Analytics section's own Active Users screen, not a
      separate implementation.
- [ ] Links to the Analytics section's Active Users screen for the full time-series view.

### Revenue Summary

- [ ] Gated by `billing:read` — distinct from `billing:manage`; viewing this tile never implies
      the ability to edit plans or Stripe config.
- [ ] Calls keep's `GET /tenants/{tenantSlug}/revenue-summary` — MRR, active-subscription counts
      by status/plan.
- [ ] Links to the Billing section.

### Recent Activity

- [ ] Gated by `activity:read`.
- [ ] Calls `GET /tenants/{tenantSlug}/activity` — but this route is the **merged** feed across
      tower, keep, and herald ([tower Story 010](../tower/010-activity-feed.md) established the
      shared shape; keep and herald each expose their own route with the identical shape). This
      tile calls all **three** and interleaves by `timestamp` client-side (or server-side in
      `web`'s own layer) — there's no single backend endpoint that already merges all three
      services' feeds into one call.
- [ ] Shows only the most recent handful (not paginated) — links to a fuller "view all activity"
      browse screen for anything beyond the tile's own small window.

---

## Layout

- [ ] Three tiles, independently present/absent based on the account's own `permissions` — an
      account holding only one of the three grants sees exactly one tile, not two placeholders
      and one real tile. An account holding none of the three sees an empty Overview (still the
      landing page, just with nothing to show) rather than being redirected elsewhere, since
      Overview itself needs no permission of its own to *exist* as a destination — only its
      tiles are gated.

---

## Not Covered Here

- The full Analytics section (Auth Funnel, Active Users, Explore) — a future story, reusing this
  tile's same underlying chronicle call for its own Active Users screen.
- The full Billing and "view all activity" screens — their own future stories.
