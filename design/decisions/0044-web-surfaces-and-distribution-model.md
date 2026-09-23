# ADR 0044: `web`'s Three Surfaces and Distribution Model

- **Status:** Accepted (mechanism corrected by [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md); `_admin` reservation superseded by [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md))
- **Date:** 2026-07-30
- **Affects:** web, portcullis, tower

> **Superseded 2026-08-19:** the reserved admin application's slug changes from `_admin` to
> `authstar` (also now a reserved *tenant* slug, which `_admin` never needed to be), and its host
> convention changes from `admin.<slug>.<baseDomain>` to `authstar.<tenant's own domain>` — see
> [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md). The "auto-provisioned,
> never-deletable, no special-casing" posture described below is unchanged.
>
> **Corrected 2026-08-01:** "full-page redirects" below is imprecise for how this actually
> works — see [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md). Portcullis *proxies*
> these reserved paths to `web` on whatever application's own host the user is already on; the
> browser's URL never changes. An earlier version of this correction (ADR 0050/0064) introduced
> a second reserved application, `_portal`, requiring an actual redirect — that's since been
> superseded too. The three-surface distinction itself (hosted pages vs. embeddable widgets vs.
> the admin app) remains correct; only the delivery mechanism for hosted pages changed.
>
> **Extended 2026-08-01:** `web` gains a genuine fourth surface —
> [ADR 0068](0068-tenant-creation-ui-surfaces.md)'s installation-level, pre-tenant public signup
> page. It deliberately does **not** go through portcullis's proxy-through mechanism (there is no
> tenant to resolve yet) — the one narrow exception to that pattern.

## Context

`web` was originally framed as a single admin control-surface app. The actual goal is broader:
remove the need for adopting applications to reimplement standard auth/billing UX. That spans
three distinct surfaces, and conflating them would be a mistake — they have genuinely different
sensitivity profiles and consumption models.

## Decision

### Three surfaces, three distribution models

1. **Admin surface** (tenant admins, and authstar operators — see Open Items) — a full
   SvelteKit app, not embedded anywhere.
2. **Login and payment-method entry** — **hosted pages, never embedded in an adopting app's own
   DOM** (delivered via proxy-through on the app's own host, not a cross-domain redirect — ADR
   0066). Not a new pattern: portcullis's `auth.loginUrl` is already a fully configurable
   target (Story 018 frames its built-in `/oauth2/select` as a placeholder specifically
   expecting a custom hosted page), and Stripe itself only ever handles raw card data inside
   its own iframe-isolated Elements/Checkout/Billing Portal — for PCI reasons, never embeddable
   third-party UI. This also matches Auth0's own documented
   guidance (hosted "Universal Login" recommended over an embedded login widget, specifically
   because embedding credential entry inside a third-party page's DOM/JS context is a real,
   well-documented XSS attack surface a separate-origin redirect avoids entirely). `web` serves
   these pages, tenant-branded, and portcullis/keep redirect to them.
3. **Embeddable, low-sensitivity widgets** (account summary, subscription status, usage meter,
   an "upgrade" button that redirects to Stripe, invite management) — **Web Components**
   (Custom Elements + Shadow DOM), themed via CSS custom properties (the same mechanism Stripe
   Elements itself uses for theming). Chosen over iframes (stronger isolation, but styling is
   more constrained and iframes have known autofill/password-manager friction) and over
   per-framework component libraries (best native UX, but N separate implementations to build
   and maintain, and reintroduces these widgets into the host app's own DOM/JS context — a
   larger XSS blast radius than Shadow DOM, for widgets that don't even handle secrets to begin
   with). Framework-agnostic by construction — works in any host app regardless of its own
   frontend stack.

Widgets in category 3 never handle raw credentials or card data — anything that would need to
is a hosted redirect (category 2) launched from within the widget, not something the widget
does itself. This is the same division of responsibility Stripe Elements/Checkout embodies:
display and initiate, delegate the sensitive part.

### The admin surface is a reserved, auto-provisioned tenant application — not a separate system

`web`'s admin UI is registered as a reserved application within **every** tenant, slug `_admin`
(the same underscore-reserved convention as portcullis's `/_authstar/*` paths), created
automatically at tenant creation and never deletable. A tenant admin authenticates via that
tenant's own configured OIDC providers, landing on an account within that tenant, gated by that
account's `permissions` (ADR 0018/0019) — the exact same shape as any other application's login,
not a special-cased system. `web` itself calls tower/keep/herald/chronicle's REST APIs using the
internal JWT portcullis forwards to it, exactly like any adopting application would — `web`
dogfoods the general-purpose application-protection model rather than being special-cased
around it.

This resolves something ADR 0021 left implicit: the CLI-issued bootstrap invite for a tenant's
very first admin has to land *somewhere* after OIDC login completes. This `_admin` application
is that destination, and — for the same bootstrap reasoning ADR 0021 already established — it
must exist before any admin does, which is why it's auto-provisioned at tenant creation rather
than something an admin sets up.

## Open Items — Not Resolved Here

- **Resolved in [ADR 0045](0045-steward-operator-console.md) (2026-07-30):** authstar's own
  operating team gets a separate service (`steward`), not a mode within `web` — cross-tenant
  visibility needs a genuinely different auth model (bearer-token, direct port-forward, never
  through portcullis), not per-tenant OIDC.
- **Resolved in [ADR 0071](0071-self-service-widget-data-access.md)/[ADR 0072](0072-embeddable-web-component-inventory.md)
  (2026-08-01):** the Web Component theming API's exact shape (a small, fixed, host-application-set
  CSS custom property set) and the concrete widget set (six named Custom Elements, each with a
  designed data contract) are both settled. Slot conventions are deliberately left
  per-widget, not globally standardized — itself the resolution, not a further deferral.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0037](0037-stripe-connect-tenant-owned-merchant-accounts.md) (superseded by [ADR 0042](0042-single-account-billing-model.md), but the PCI/hosted-card-entry reasoning carries forward unchanged)
