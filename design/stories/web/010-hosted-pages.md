# Story 010 — Hosted Pages

**Epic:** Hosted Surfaces
**Repo:** web
**Status:** Draft
**New — web's side of the pages [ADR 0066](../../decisions/0066-portcullis-proxies-branded-pages-to-web.md)/
[ADR 0068](../../decisions/0068-tenant-creation-ui-surfaces.md)/
[ADR 0070](../../decisions/0070-self-service-identity-linking.md) already specify.**
Per [ADR 0044](../../decisions/0044-web-surfaces-and-distribution-model.md),
[ADR 0065](../../decisions/0065-portal-upgrade-flow.md),
[ADR 0066](../../decisions/0066-portcullis-proxies-branded-pages-to-web.md),
[ADR 0068](../../decisions/0068-tenant-creation-ui-surfaces.md),
[ADR 0070](../../decisions/0070-self-service-identity-linking.md).
**Depends on:** [tower Story 012](../tower/012-tenant-creation-and-provisioning.md)'s
`POST /tenants`, [tower Story 009](../tower/009-self-service-identities-and-me-routes.md)'s
`POST /identity-links`.

---

## Summary

None of these pages are part of the `_admin` app ([Story 001](001-app-shell-auth-and-section-gating.md))
— they're `web`'s second, genuinely distinct surface (ADR 0044), reached via portcullis's
proxy-through mechanism on whatever application host the visitor is already on, never a redirect
to a separate domain.

---

## `/oauth2/select` — branded login, fully header-driven

- [ ] **No live API call of any kind** — portcullis attaches `tenant.branding` and the resolved
      application's exposed-provider list (with `loginPath`s already resolved to full URLs) as
      request headers before proxying; this page reads those headers and renders, nothing else.
- [ ] Exempt (unauthenticated) — this is the login entry point itself. If `web` is unreachable,
      portcullis falls back to its own built-in unbranded page (a portcullis-side story, not this
      one) — this page's own failure mode is simply "never gets hit," not something it needs to
      handle defensively.

## `/_authstar/upgrade` — checkout initiation, protected

- [ ] Calls keep's plan-mappings/checkout-sessions routes ([keep Story 003](../keep/003-plan-mappings-checkout-and-billing-reads.md))
      server-side, using the forwarded internal JWT already attached by the time portcullis
      proxies here — same auth posture as any `_admin` screen, just not part of `_admin`'s own
      navigation.
- [ ] No fallback if `web` is unreachable (plain `502`/`504`) — unlike `/oauth2/select`, there's
      no bare-bones equivalent to fall back to for a checkout flow.
- [ ] Tenant-branded via the same header-attachment mechanism as `/oauth2/select`.

## `/_authstar/link/confirm` — identity-linking confirmation, protected

- [ ] Renders "Link your {idp} account?" from a single header portcullis attaches (the pending
      link's `idp` name, read from the `oauth2-pending-link` cookie server-side) — no live call
      needed to render.
- [ ] **Confirm posts to a portcullis-owned endpoint, not to `web`** — `POST
      /_authstar/link/confirm` is handled entirely by portcullis (reading the identity hash only
      from its own cookie), calling tower's `POST /identity-links` itself. This page's own job
      ends at rendering the confirm/cancel buttons and submitting the form; it has no server-side
      logic of its own beyond that render.

## Public Signup Page — the one page with no tenant at all

- [ ] Reachable at a **fixed, non-tenant host** (e.g. `signup.{baseDomain}`), not one of
      portcullis's per-tenant resolved hosts — genuinely outside `_admin`'s auth model entirely,
      not merely unauthenticated within it.
- [ ] Submits **directly** to tower's pre-tenant direct ingress (`POST /tenants`,
      [tower Story 012](../tower/012-tenant-creation-and-provisioning.md)) — the **only** place
      in this entire design where `web` calls a backend service without an internal JWT or any
      portcullis mediation at all. Requires tower's ingress to have CORS configured specifically
      for this one host.
- [ ] Collects `name`/`slug`/`adminEmail` — **no `adminHost` field** (that's operator-only, via
      `steward`, tower Story 012); a self-service signup never gets to choose `_admin`'s host.
- [ ] On success: a "check your email to finish setting up your account" confirmation — no
      auto-login, no session, since the actual first authentication is the ordinary invite-
      redemption OIDC flow, unchanged from every other invite (tower Story 007/012).
- [ ] **Failure handling mirrors [steward Story 002](../steward/002-tenant-search-and-creation.md)'s**
      own guidance exactly: if provisioning fails partway through, the message should say
      retrying the same `slug` is the correct next action, not imply the whole thing needs to
      start over with a different one.

---

## Not Covered Here

- The `_admin` app itself — [Story 001](001-app-shell-auth-and-section-gating.md) and the eight
  section stories.
- The embeddable widget library — [Story 011](011-embeddable-widgets.md).
