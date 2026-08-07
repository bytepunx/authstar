# Story 011 — Embeddable Widget Library

**Epic:** Widget Library
**Repo:** web
**Status:** Draft
**New — web's side of the widgets [ADR 0072](../../decisions/0072-embeddable-web-component-inventory.md)
already specifies.** Per [ADR 0044](../../decisions/0044-web-surfaces-and-distribution-model.md),
[ADR 0071](../../decisions/0071-self-service-widget-data-access.md),
[ADR 0072](../../decisions/0072-embeddable-web-component-inventory.md).
Per [tech-stack.md](../../docs/tech-stack.md) — a separate Vite library-mode build target from
the SvelteKit admin app, not the same bundle.

---

## Summary

Six Custom Elements (Shadow DOM), framework-agnostic, no dependency on SvelteKit or any
framework at runtime — a genuinely different build target living in the same repo, not a
SvelteKit feature. Every widget calls a portcullis `/_authstar/me/*` route
([ADR 0071](../../decisions/0071-self-service-widget-data-access.md)) same-origin, relative
URL, no CORS needed, since the adopting application's own host is what portcullis fronts.

---

## `<authstar-account-summary>`

- [ ] `GET /_authstar/me/account` — `status`, `contact.name`/`email`, `grantedRoles`/
      `trialRoles` as **display-only tags** — this widget never claims to explain what a role
      *means* (ADR 0069), only that the account holds it.
- [ ] Linked sign-in methods: `GET /_authstar/me/identities` (linked) cross-referenced
      client-side against `GET /oauth2/providers` (available, already exempt, no-tower-call) —
      renders "linked"/unlink for the former, "link" (→ `/oauth2/{name}/link`) for providers not
      yet linked. The diff is computed in the widget itself; no backend endpoint returns this
      comparison pre-computed.
- [ ] **Unlink action surfaces tower's own two rejection cases plainly** (tower Story 009): "this
      is your only sign-in method" and "you can't unlink the identity you're currently using" are
      different messages, not one generic "can't unlink" error — the second specifically should
      say "log out and back in with a different linked method first," since that's the actual
      correct next step.

## `<authstar-subscription-status>`

- [ ] `GET /_authstar/me/subscription` — `status`/`planName`, `currentPeriodEnd` for
      `active`/`trialing`. `status: null` (keep's own "no subscription" response, keep Story 006)
      renders as an empty/neutral state, not an error.
- [ ] `past_due` links to `/_authstar/upgrade` — the existing hosted page
      ([Story 010](010-hosted-pages.md)), not a payment-retry flow this widget builds itself.

## `<authstar-usage-meter meter="...">`

- [ ] `GET /_authstar/me/account`, reads its `usage` array (not a separate route — folded into
      the same account call, ADR 0071), filters to the `meter` attribute (and optional
      `application`, defaulting to the current one). `periodLimit: null` renders as unlimited —
      not a zero-percent or broken bar.

## `<authstar-upgrade-button>`

- [ ] No data fetch — a styled `<a href="/_authstar/upgrade">`. The simplest widget by
      construction, matching ADR 0044's own "display and initiate, delegate the sensitive part"
      framing for this whole category.

## `<authstar-invite-widget>`

- [ ] `GET /_authstar/me/invite-codes` (list); create action **gated client-side** on
      `/_authstar/me/account`'s `permissions` array containing `invite:code:issue` — this widget
      doesn't render a create button that would just `403`, it checks first. `POST`s to the same
      endpoint.

## `<authstar-data-export-button>`

- [ ] A single action, not a rendered view — `GET /_authstar/me/export`, triggers a browser
      download of the returned JSON. No polling, no progress UI — same synchronous,
      generated-on-demand contract as the admin path ([Story 008](008-privacy-and-compliance.md)).

---

## Theming

- [ ] A small, fixed set of CSS custom properties the **host application** sets (not fetched
      live from `tenant.branding` — a deliberate simplification, ADR 0072, avoiding
      reintroducing the render-time dependency ADR 0066 specifically eliminated for hosted
      pages):

```css
--authstar-font-family
--authstar-color-primary
--authstar-color-text
--authstar-color-background
--authstar-border-radius
--authstar-spacing-unit
```

- [ ] Sensible built-in defaults apply when unset — a host application that sets none of these
      still gets a usable, if generic, rendering.
- [ ] Slot conventions are **not** globally standardized — each widget defines whatever slots its
      own layout needs (ADR 0072's own deliberate non-decision, not a gap this story should try
      to close).

---

## Not Covered Here

- The `_admin` app and hosted pages — [Story 001](001-app-shell-auth-and-section-gating.md)
  through [Story 010](010-hosted-pages.md).
- The build/publish pipeline for this separate library target — an implementation/tooling
  concern, not a widget behavior.
