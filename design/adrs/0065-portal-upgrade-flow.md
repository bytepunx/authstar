---
id: ADR-0065
title: The Upgrade/Checkout Flow
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0065: The Upgrade/Checkout Flow

- **Status:** Accepted
- **Date:** 2026-08-01 (host mechanics corrected 2026-08-01)
- **Affects:** web, portcullis
- **Depends on:** [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md)

> **Corrected 2026-08-01.** This ADR's title and host references originally assumed a separate
> `_portal` application (ADR 0050/0064), since superseded by
> [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md). The auth/mechanism reasoning
> below was already correct and is unchanged — only the host it's reached on changes: a new
> `/_authstar/upgrade` reserved path, proxied to `web` on whatever application's own host the
> user is already on, the same mechanism ADR 0066 established for the login page.

## Decision

Requires authentication.

### Requires authentication

`/_authstar/upgrade` is **not** on any application's exempt list — the normal auth gate (Story
013) runs first, same as any other protected path. A user reaching it already has a valid
session, so portcullis's normal proxy already attaches the forwarded internal JWT by the time
the request reaches `web` — `web` calls `keep` the same way `_admin` calls any backend service
for an authenticated action. No new auth mechanism, unlike the login page, which needed one
resolved fresh (ADR 0066) precisely because it has no session to forward.

### Not application-scoped, unlike the login page

`planMapping` is tenant-scoped, not tied to one application (`grantedRoles` can span several
applications within one plan, ADR 0038) — so the upgrade page shows the tenant's active plan
mappings (`GET /tenants/{tenantSlug}/plan-mappings`, filtered to `status: "active"`) regardless
of which application's host the user arrived from. No per-application disambiguation is needed
here the way the login page required.

### Direct redirect to Stripe Checkout — no intermediate branded page

Once a plan is selected, `web` calls `keep`'s `checkout-sessions` endpoint and redirects
straight to Stripe's own hosted Checkout URL. Stripe's Checkout page is already a trusted,
recognized hosted page — inserting authstar's own "you're about to be redirected" transition
screen would add friction without adding trust.

### `success_url`/`cancel_url` point back to simple confirmation pages, same host

Deliberately simpler than the login flow's return-handling: rather than propagating a
return-to-originating-page URL through the checkout round trip, Stripe redirects back to
`/_authstar/upgrade/success` or `/_authstar/upgrade/cancelled` (same reserved-path-proxied-to-web
mechanism, same host the user started on) — a plain confirmation with a generic "you can close
this tab and return to the app" instruction. Building a full return-URL propagation mechanism
for a much lower-frequency, less time-pressured flow than login isn't justified for a first
version — auto-returning to a specific originating page is a reasonable future enhancement, not
required now.

### Failure handling: ordinary unreachable-upstream behavior, no special fallback

Unlike `/oauth2/select` (which falls back to Story 018's built-in page if `web` is unreachable),
there's no equivalent bare-bones upgrade flow to fall back to — an unreachable `web` produces
the same `502`/`504` any other unreachable upstream already produces (Story 011).

## Consequences

- No new backend mechanism beyond ADR 0066's core proxy-through capability — this section is a
  straightforward consumer of `keep`'s existing `plan-mappings` and `checkout-sessions` routes
  (ADR 0041), using the same authenticated-request pattern every other `web` screen already uses.

## Related

- [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md)
