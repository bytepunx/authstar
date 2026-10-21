---
id: ADR-0099
title: Hosted, Tenant-Brandable UI Surfaces for Platform-Owned Concepts
status: proposed
date: 2026-08-25
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0099: Hosted, Tenant-Brandable UI Surfaces for Platform-Owned Concepts

- **Status:** Proposed
- **Date:** 2026-08-25
- **Affects:** web, portcullis, keep (and every tenant application that would stop building its own UI for these concepts)

## Context

Every tenant application that wants to expose a platform-owned concept to its own customers — a
billing portal, organization member management, coupon redemption — currently has to build that
UI itself, wired against keep/tower's raw REST API. `loci`'s account page (upgrade/manage-billing)
is the concrete example so far, and coupon redemption (deferred pending ADR 0098 landing) would be
the next one. This doesn't scale: every tenant app re-implements the same forms, the same error
handling, the same "what does a 409 mean here" logic, with no shared visual language.

This ADR is a **proposal**, not a decision — it sketches a direction and names the open questions
rather than resolving them, so it can be picked up as a real implementation plan once prioritized.

## Decision

No decision is recorded yet: this ADR is a proposal, and the sketch and open questions below are what a later ADR would decide.

## Sketch

`authstar/web` (already the platform's own SvelteKit admin app) grows a second surface: hosted,
per-tenant pages for the customer-facing side of these same concepts, reachable either via a
tenant-slug-scoped path (`https://web.bytepunx-domain/t/{tenantSlug}/billing`,
`.../t/{tenantSlug}/redeem`) or — matching ADR 0091's existing tenant-owned-domain work — a real
CNAME under the tenant's own domain. A tenant app like loci would `redirect()` its own "Manage
billing" or "Have a code?" actions straight to the hosted page instead of rendering its own form,
the same way it already redirects to Stripe's own hosted Checkout/Billing Portal today.

Branding would come from signet-stored per-tenant config — logo, primary/accent color, maybe a
custom font stack — read the same way `portcullis.yaml`'s tenant config already carries a
`branding` block (referenced by `TenantRuntime.branding` in portcullis, currently only used for
session/cookie behavior, not rendering) so there's no new secret-storage mechanism to invent.

Candidate first concepts, roughly in priority order once this is picked up:
1. Organization member + billing-access self-service (this session's Part D work already puts a
   version of this in `web`'s *admin* surface — the open question is whether a customer-facing
   variant is a genuinely separate page or the same page with a narrower permission view).
2. Coupon redemption (the deferred feature from this session).
3. The Stripe Billing Portal redirect itself — lower priority, since it already works today via a
   plain redirect to Stripe's own hosted UI; brandable-hosting only matters here if we want to
   interpose our own page before handing off to Stripe.

## Open questions (deliberately not decided here)

- **Embed vs. redirect.** A full-page redirect (like Stripe's own pattern) is far simpler to build
  and reason about, but an iframe embed would let a tenant app keep its own chrome around the
  content. Iframe embedding raises real questions (auth handoff across origins, CSP, responsive
  sizing) that a redirect avoids entirely.
- **How deep does branding go?** Logo + color swap is cheap. Full CSS/theming control is a much
  bigger surface (and a security question — arbitrary CSS from tenant config is a real injection
  vector) that needs its own decision.
- **Auth boundary.** Is this surface fronted by portcullis (same session/cookie model every tenant
  app already uses) or does it need its own, separate authenticated surface? Fronting via
  portcullis is the simpler default given it's already the platform's shared entry point, but
  hasn't been checked against how portcullis resolves "which application" for a path that isn't a
  registered tenant application in the usual sense.
- **Versioning/rollback.** Once a tenant app depends on redirecting to a hosted authstar page, a
  breaking change to that page is a breaking change for every tenant simultaneously — a different
  blast radius than each tenant app choosing when to upgrade its own bundled UI.

## Consequences (if adopted)

Not enumerated here — deliberately left for the real implementation ADR once this direction is
confirmed. This document exists to record the idea and its open questions, not to commit to an
implementation.

## Related

- [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md) (tenant-owned domains —
  the existing mechanism a real CNAME-based version of this would build on)
- [ADR 0098](0098-organization-permission-lifecycle.md) (the organization billing-access delegation
  work this ADR's first candidate concept would sit alongside)
