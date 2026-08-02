# Story 023 — Branded Page Proxying to `web`

**Epic:** Utility Endpoints
**Repo:** portcullis
**Status:** Draft
**New — not present in `ref-design`.** Per [ADR 0066](../../decisions/0066-portcullis-proxies-branded-pages-to-web.md).

---

## Summary

Portcullis proxies two reserved paths — `/oauth2/select` and `/_authstar/upgrade` — to `web`'s
own upstream instead of either handling them locally (Story 018) or forwarding to the tenant's
configured product upstream (Story 011/012). The browser's host never changes; `web` renders
tenant-branded content while the user stays on whichever application's domain they're already
on.

---

## Acceptance Criteria

### Routing

- [ ] `/oauth2/select` and `/_authstar/upgrade`, for **every** application (including `_admin`
      — no special-casing), route to `webUpstream` (Story 001's new global bundle field) instead
      of that application's own configured `upstream.base`/`upstream.routes`. This takes
      precedence over normal prefix routing (Story 012) for these two specific reserved paths.
- [ ] The proxy call to `web` uses SPIFFE mTLS, the same pattern as portcullis's existing calls
      to tower and lookout — `web` is a first-party authstar service, not an arbitrary tenant
      upstream.
- [ ] `X-Forwarded-Host` (already set on every proxied request, Story 011) is what `web` uses to
      resolve which tenant/application it's rendering for — no additional identifying parameter
      is added or needed.

### `/oauth2/select` — exempt, headers carry what portcullis already has

- [ ] `/oauth2/select` remains on the exempt list (Story 003) — reachable without a session,
      unchanged from Story 018's original scope.
- [ ] Portcullis attaches the resolved tenant's `branding` (Story 001) and the resolved
      application's exposed-provider list (with `loginPath`s already resolved to full URLs on
      that application's own host) as request headers on the proxied call to `web`. `web`
      performs no live tower call to render this page — everything it needs arrives with the
      request.
- [ ] If `web` is unreachable or times out, portcullis falls back to Story 018's own built-in,
      unbranded selection page — the request is *not* failed outright the way an ordinary
      unreachable-upstream case would be (Story 011).

### `/_authstar/upgrade` — protected, uses the normal forwarded-JWT pattern

- [ ] `/_authstar/upgrade` is **not** exempt — the normal auth gate (Story 013) runs first, same
      as any other protected path. By the time the request reaches `web`, it carries the normal
      forwarded internal JWT (Story 010) if the session is valid, exactly like any other
      authenticated proxied request.
- [ ] No fallback exists for this path if `web` is unreachable — it fails the same way any other
      unreachable upstream does (`502`/`504`, Story 011). There is no bare-bones equivalent to
      fall back to.

---

## Notes

- This story supersedes the earlier `_portal`-based design (ADR 0050/0064, since superseded) —
  no second reserved application exists; both paths are proxied identically for every
  application, including `_admin`.
- Cross-reference: Story 022 (Stripe webhook passthrough) is the closest existing precedent for
  "a reserved path proxied to a fixed backend rather than the tenant's own upstream," though that
  one has no equivalent to the header-attachment or fallback behavior described here.
