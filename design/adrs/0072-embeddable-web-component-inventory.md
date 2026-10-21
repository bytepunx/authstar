---
id: ADR-0072
title: Embeddable Web Component Inventory
status: accepted
date: 2026-08-01
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0072: Embeddable Web Component Inventory

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web
- **Depends on:** [ADR 0071](0071-self-service-widget-data-access.md)
- **Resolves the open items in:** [ADR 0044](0044-web-surfaces-and-distribution-model.md)

## Context

ADR 0044 named the widget category and picked Web Components as the mechanism but left the
concrete set, their data contracts, and the theming API's exact shape undesigned. ADR 0071 just
closed the harder prerequisite — how a widget gets data at all without a backend of its own.
This ADR designs the six widgets themselves.

## Decision

`<authstar-account-summary>`.

### `<authstar-account-summary>`

Calls `GET /_authstar/me/account` (ADR 0071). Displays status, `contact.name`/`email`,
`grantedRoles`/`trialRoles` as plain tags (display only — per [ADR 0069](0069-role-interpretation-is-application-owned.md),
this widget never claims to explain what a role *means*, only that the account holds it), and a
**linked sign-in methods** section (ADR 0070's natural home for this): reads
`GET /_authstar/me/identities` for what's linked, cross-references against `GET /oauth2/
providers` (Story 017 — already exempt, no-tower-call, portcullis-owned) for what this
application exposes, and renders "linked"/unlink for the former and "link" (→ `/oauth2/{name}/
link`, ADR 0070) for providers not yet linked. No new endpoint needed for the cross-reference —
both pieces already exist independently; the widget does the diff client-side.

### `<authstar-subscription-status>`

Calls `GET /_authstar/me/subscription`. Displays `status` and `planName`, with `currentPeriodEnd`
shown for `active`/`trialing`. A `past_due` status surfaces a link to `/_authstar/upgrade`
(reusing the existing proxied page rather than this widget growing its own payment-retry UI).

### `<authstar-usage-meter meter="...">`

Calls `GET /_authstar/me/account`, reads the `usage` array (folded into that response per ADR
0071, sourced from the same materialized claims that actually drive entitlement enforcement —
not keep's admin view, per ADR 0054's existing reasoning), and renders the entry matching the
required `meter` attribute (and optional `application` attribute, defaulting to the current
one) as a progress indicator: `periodUsage`/`periodLimit`. `periodLimit: null` renders as
unlimited, not a `0%`/broken bar.

### `<authstar-upgrade-button>`

No data fetch — a styled `<a href="/_authstar/upgrade">` (ADR 0065/0066, already fully designed).
The simplest widget by construction: display and initiate, delegate the sensitive part, exactly
the division of responsibility ADR 0044 already established for this category.

### `<authstar-invite-widget>`

Calls `GET /_authstar/me/invite-codes` for the caller's own issued codes (`redemptionCount`/
`maxRedemptions`/`status`), and conditionally offers a "create new code" action — gated
client-side on whether `/_authstar/me/account`'s `permissions` list includes
`invite:code:issue` (ADR 0071 already includes `permissions` in that response specifically to
support this kind of check), so the widget doesn't render a button that would just 403. `POST`s
to the same `/_authstar/me/invite-codes` on creation. This is the concrete implementation of the
case ADR 0019/0051 both named but left unbuilt: "referral-enabled regular users."

### `<authstar-data-export-button>`

A single action, not a rendered data view — calls `GET /_authstar/me/export` and triggers a
browser download of the returned JSON, the self-service counterpart to ADR 0057's admin screen.
No polling, no progress UI — same synchronous, generated-on-demand contract as the admin path
(ADR 0056).

### Theming — a small, fixed set of CSS custom properties, host-application-set

Resolves ADR 0044's "exact shape not designed here" open item. Widgets are styled entirely by
custom properties the **host application** sets (typically on an ancestor element, standard CSS
custom-property inheritance) — not fetched live from any branding endpoint. This is a deliberate
simplification: `tenant.branding` (ADR 0066) is the *admin/hosted-page* brand identity;
a product embedding these widgets already has its own look, which may or may not match, and
forcing a live branding fetch into every widget would reintroduce exactly the kind of
tower-dependency-on-render this design has avoided everywhere else (ADR 0066's whole point was
*not* needing a live call to render). Sensible built-in defaults apply when unset.

```css
--authstar-font-family
--authstar-color-primary
--authstar-color-text
--authstar-color-background
--authstar-border-radius
--authstar-spacing-unit
```

### Slot conventions — deliberately not globally standardized

The other open item ADR 0044 left. A button, a list, and a meter don't share enough shape to
benefit from one forced slot scheme — each widget defines whatever slots its own layout
naturally needs (e.g. `<authstar-invite-widget>` might expose an `empty` slot for "no codes
yet"), left to each widget's own design rather than a premature shared convention.

## Consequences

- Six Custom Elements to build in `web`'s published widget package.
- No new backend routes beyond what ADR 0071 already added — this ADR is purely the
  browser-side contract layer on top of it.
- ADR 0044's two Open Items (theming shape, slot conventions) are both closed.

## Related

- [ADR 0019](0019-invite-codes.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0043](0043-application-reported-usage-metering.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md), [ADR 0054](0054-web-billing-and-communications-screens.md), [ADR 0056](0056-gdpr-data-export.md), [ADR 0057](0057-web-data-export-screen.md), [ADR 0065](0065-portal-upgrade-flow.md), [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md), [ADR 0069](0069-role-interpretation-is-application-owned.md), [ADR 0070](0070-self-service-identity-linking.md), [ADR 0071](0071-self-service-widget-data-access.md)
