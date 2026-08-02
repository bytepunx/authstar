# ADR 0065: `_portal`'s Upgrade/Checkout Flow

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web
- **Depends on:** [ADR 0050](0050-portal-reserved-application.md), [ADR 0064](0064-portal-signin-flow.md)

## Decision

### Requires authentication — unlike the login page

`_portal`'s upgrade page is on the *protected* side of `_portal`'s own exempt list (Story 003's
existing per-path mechanism already supports one application mixing public and protected paths
— no new capability needed, just confirming how it applies here). A user reaching it already has
a valid session, so portcullis attaches the normal forwarded internal JWT — `_portal`'s backend
calls `keep` the same way `_admin` calls any backend service for an authenticated action. No new
auth mechanism, unlike the login page's need to resolve that question fresh (ADR 0064).

### Not application-scoped, unlike the login page

`planMapping` is tenant-scoped, not tied to one application (`grantedRoles` can span several
applications within one plan, ADR 0038) — so the upgrade page shows the tenant's active plan
mappings (`GET /tenants/{tenantSlug}/plan-mappings`, filtered to `status: "active"`) regardless
of which application the user arrived from. No `?app=` parameter needed here.

### Direct redirect to Stripe Checkout — no intermediate branded page

Once a plan is selected, `_portal` calls `keep`'s `checkout-sessions` endpoint and redirects
straight to Stripe's own hosted Checkout URL. Stripe's Checkout page is already a trusted,
recognized hosted page — inserting authstar's own "you're about to be redirected" transition
screen would add friction without adding trust.

### `success_url`/`cancel_url` point back to `_portal`'s own simple confirmation pages

Deliberately simpler than the login flow's return-URL handling: rather than propagating a
return-to-originating-application URL through the checkout round trip, Stripe redirects back to
`_portal`'s own `/upgrade/success` or `/upgrade/cancelled` pages, which show a plain
confirmation and a generic "you can close this tab and return to the app" instruction. Building
a second return-URL propagation mechanism for a much lower-frequency, less time-pressured flow
than login isn't justified for a first version — auto-returning to the originating application's
specific page is a reasonable future enhancement, not required now.

## Consequences

- No new backend mechanism — this section is a straightforward consumer of `keep`'s existing
  `plan-mappings` and `checkout-sessions` routes (ADR 0041), using the same authenticated-request
  pattern every other `web` screen already uses.

## Related

- [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0050](0050-portal-reserved-application.md), [ADR 0064](0064-portal-signin-flow.md)
