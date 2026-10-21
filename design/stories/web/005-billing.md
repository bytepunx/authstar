---
title: "Story 005: Billing"
updated: 2026-08-06
status: draft
---
# Story 005 — Billing

**Epic:** Admin App
**Repo:** web
**Status:** Draft
**New — web's side of the screens [ADR 0054](../../adrs/0054-web-billing-and-communications-screens.md)
already specifies.** Per [ADR 0052](../../adrs/0052-keep-herald-own-signet-access.md),
[ADR 0054](../../adrs/0054-web-billing-and-communications-screens.md),
[ADR 0060](../../adrs/0060-activity-feed-and-revenue-summary.md),
[ADR 0077](../../adrs/0077-keep-refunds-and-disputes.md).
**Depends on:** [keep Story 001](../keep/001-actor-definitions.md) through
[Story 006](../keep/006-self-service-config-and-activity.md) — every route this screen calls is
already fully specified there.

---

## Stripe Connection

- [ ] Secret key + webhook secret entry — write-only, never redisplayed (keep's `stripe-config`
      route, [keep Story 006](../keep/006-self-service-config-and-activity.md)).
- [ ] **A connection-health indicator, not just "a key is present."** Keep validates the key at
      *set* time with a cheap Stripe API call and this screen reflects that validation's actual
      result — a green "connected" state means keep confirmed the key works, not merely that a
      value was saved.

## Customer

- [ ] Read-only, tenant-scoped and per-account, with a **"view in Stripe Dashboard" deep link**
      (`https://dashboard.stripe.com/customers/{stripeCustomerId}`) — leans on Stripe's own
      richer UI for anything beyond what keep itself tracks, rather than rebuilding it.

## Plan Mappings

- [ ] List (active by default, toggle to include retired), create/edit, retire (never a hard
      delete — existing subscribers on a retired plan still need correct renewal processing).
- [ ] `grantedRoles` editor uses the **same live application/role dropdowns** Identity & Access
      ([Story 004](004-identity-and-access.md)) already established — not a separately built
      picker. A `grantedRoles` entry referencing an application/role keep's own local reference
      cache doesn't recognize is rejected server-side (keep Story 003/ADR 0047) — this screen's
      dropdowns being sourced from the *same* live data tower/keep both draw from is what keeps
      that rejection from ever actually firing in normal use.

## Checkout Sessions

- [ ] Not a primary screen action — session creation is driven by `/_authstar/upgrade` (a
      future hosted-pages story) or the `<authstar-upgrade-button>` widget, not something an
      admin routinely does *for* a user. A small "send this customer a checkout link" affordance
      on the Customer detail view is reasonable, not a dedicated section.

## Subscriptions

- [ ] Read-only list/detail, webhook-driven — no write actions anywhere on this screen, since
      keep itself has none for `subscription` (keep Story 001/003).

## Refunds and Disputes

- [ ] Read-only, webhook-populated (keep Story 001/002). A dispute in `needs_response` gets a
      **visible warning treatment** (time-sensitive — Stripe enforces a real response deadline)
      but this screen builds **no response-submission flow** — that stays entirely in the
      tenant's own Stripe dashboard, same deference this section already gives Customer detail.

## Trials

- [ ] List, create, extend (`PATCH { expiresAt }` — appends to the `extensions` audit trail,
      shown as a small history list on the trial's own detail view, not just a bare "extended"
      flag), revoke.

## Coupons

- [ ] List, create, revoke. Scoped explicitly to the "grants beyond a price adjustment" case —
      this screen's own copy/help text should say plainly that a pure percentage/fixed discount
      belongs in Stripe's own dashboard, not here, to avoid an admin creating a redundant or
      conflicting record for something Stripe already handles natively.

## Usage

- [ ] Keep's `usage-records` list is the **canonical admin-facing view** — tower's own
      materialized copy (which drives internal-token claims) is deliberately **not** separately
      surfaced here, to avoid ever showing two transiently-inconsistent numbers for the same
      thing on the same screen.

---

## Not Covered Here

- The Communications section (herald) — a future story.
- `/_authstar/upgrade` itself — a future hosted-pages story.
