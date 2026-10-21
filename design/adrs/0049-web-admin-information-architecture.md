---
id: ADR-0049
title: "`web`'s Admin Surface — Information Architecture"
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0049: `web`'s Admin Surface — Information Architecture

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web, herald
- **Extends:** [ADR 0044](0044-web-surfaces-and-distribution-model.md)

## Context

ADR 0044 established `web`'s admin surface as a reserved `_admin` tenant application; the
backend it needs to expose now fully exists across four services (tower, keep, herald,
chronicle), each with real depth. Unlike `steward` (ADR 0048), which stayed intentionally narrow
given its tiny backend surface (admins + OIDC providers only), `web`'s admin surface needs actual
information architecture, not a flat list of screens.

## Decision

Navigation is permission-aware, not a single fixed "admin" experience.

### Navigation is permission-aware, not a single fixed "admin" experience

Every top-level section is shown or hidden based on whether the authenticated account holds the
relevant `permissions` — a direct, necessary consequence of `permissions` being a granular,
non-admin-exclusive capability system (ADR 0018/0019: a regular account can legitimately hold a
single narrow grant without being a full admin). An account holding only `contacts:read`
(handling erasure requests) sees just Privacy & Compliance, not the full suite. The Overview
section (below) degrades the same way — it shows only the summary tiles the account's held
permissions actually allow it to see, not an all-or-nothing gate.

### Eight sections

1. **Overview** — a lean at-a-glance landing page: active users (chronicle's `active-users`
   report), subscription/revenue summary (keep), recent activity across services. Not a BI
   tool — deeper analysis lives in Analytics.
2. **Applications** — CRUD over the tenant's own applications: hosts, upstream routing, CORS
   origins, exempt paths, which providers are exposed, `auth.loginUrl` (tower, ADR 0016/0030).
3. **Identity & Access** — OIDC Providers, Role Definitions (the catalog, ADR 0047), Accounts
   (search/status/roles/permissions), Invites & Invite Codes (tower). Provider management here
   is the **ongoing, self-service** counterpart to `steward`'s bootstrap/recovery capability
   (ADR 0021/0048) — not a duplicate of it; `steward` exists for when no admin can reach `web`
   yet, `web` is for everyday management once one can.
4. **Billing** — Stripe connection setup (the tenant's own secret key, ADR 0046), Plan
   Mappings, Subscriptions, Trials, Coupons, Customer records (keep).
5. **Communications** — Communication Types, Templates (versioned), Communication History
   (audit + on-demand render), Opt-outs, Sending Configuration (herald, including the
   sending-config routes added to ADR 0034 below).
6. **Analytics** — the two purpose-built reports (auth-funnel, active-users) plus the
   constrained query endpoint as an advanced/power-user view (chronicle, ADR 0036).
7. **Privacy & Compliance** — Contacts (search/view/erase), Erasure Requests (status/proof of
   completion) (tower, ADR 0023/0026). Deliberately **separate** from Identity & Access rather
   than buried inside Accounts, given the weight this design places on GDPR handling — an admin
   under time pressure to process an erasure request should be able to find it immediately.
8. **Settings** — tenant-level non-secret fields (name, cookie config). Low-frequency,
   "handle with care" — cookie `domain` especially is tightly coupled to live DNS/session
   state; the UI should not present it as a casual edit.

### Gap found and closed: herald had no route for a tenant to configure its own sending adapter

ADR 0032 defined per-tenant sending config's shape (provider, addresses, credential) but no
route ever let a tenant admin set it up via `web` — the Communications section above needs one
to be complete. Added directly to ADR 0034 (`GET`/`PATCH /tenants/{tenantSlug}/sending-config`)
rather than left as a forward reference.

## Consequences

- Herald gains the sending-config routes (added to ADR 0034 in this same pass).
- Each of the eight sections needs its own screen-by-screen design pass — this ADR settles the
  map, not the individual screens, the same sequencing already used to build up tower/keep/
  herald's own APIs epic by epic.

## Related

- [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0032](0032-per-tenant-sending-and-can-spam.md), [ADR 0034](0034-herald-api-surface.md), [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0048](0048-steward-ux.md)
