# ADR 0066: Portcullis Proxies Branded Pages to `web` — Same Host, No Redirect, No `_portal`

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** portcullis, tower, web
- **Supersedes:** [ADR 0050](0050-portal-reserved-application.md), [ADR 0064](0064-portal-signin-flow.md)
- **Corrects (not supersedes):** [ADR 0065](0065-portal-upgrade-flow.md)

## Context

ADR 0050/0064 solved "which application does this login page belong to" with a redirect to a
second reserved application (`_portal`) plus an explicit `?app=` parameter. That works, but it
has a real cost the redirect itself introduces: the browser's URL bar visibly leaves the
product the user is actually trying to reach before coming back, which is both a worse
experience and a less clear signal of intent than staying on the product's own domain
throughout. A subdomain-per-application design — where the host itself is already an
unambiguous intent signal — avoids that cost, and re-deriving the mechanism with that framing
in mind produces something simpler than what ADR 0050/0064 built, not just different.

## Decision

### Reserved paths proxy to a fixed, installation-wide `web` upstream — same host, no redirect

`/oauth2/select` (Story 018) and a new `/_authstar/upgrade` path are, for every application
(including `_admin` — no special-casing), routed to `web`'s own upstream instead of either
portcullis's own local Rust handler or the tenant's configured product upstream. The browser's
host never changes — `math.acme.example.com/oauth2/select` renders `web`'s tenant-branded
content while staying on `math`'s own domain throughout.

Mechanically this is not a new capability — it's Story 012's existing prefix-routing logic
(route a specific path to a specific upstream), just with a fixed, installation-wide upstream
(`web`) instead of a per-tenant-configured one. Reached via SPIFFE mTLS, the same pattern
already used for portcullis→tower and portcullis→lookout — `web` is a first-party authstar
service, not an arbitrary tenant backend, so it gets the same trust treatment. Portcullis's
bundle gains a new **global, non-tenant-scoped** field for this — `webUpstream: { address,
timeout }` — delivered via signet the same way everything else in the bundle is, alongside
`tenants`, not nested under it.

### `_portal` no longer exists as a concept — `_admin` is unaffected

The entire premise of a second reserved application requiring a redirect is gone. Every
application, including `_admin` itself, handles its own login the same way: a path on its own
host, proxied to `web` when reached. `_admin`'s status as a genuinely separate reserved
*application* (ADR 0044/0045's trust-boundary reasoning — its own elevated, `permissions`-gated
surface) is completely unaffected by this change; that reasoning was never about who renders a
login page.

### `auth.loginUrl`'s default reverts to Story 001/018's original computation

`/oauth2/select` if the application exposes 2+ providers, else that single provider's own
`loginPath` directly — exactly as originally specified, before ADR 0050/0064 introduced the
`_portal`-pointing, `?app=`-carrying default. That default is discarded along with `_portal`
itself.

### Portcullis attaches what it already has as request headers — no new live call, by either side

The insight that eliminates the need for `web` to fetch anything or for a new service-level auth
mechanism: portcullis has *already resolved* the tenant and application from `Host` before
deciding to proxy. It already holds that tenant's `branding` and that application's exposed
providers (with `loginPath`s already resolved to full URLs on the application's own host) in
its own bundle. Rather than `web` re-fetching this from tower, portcullis attaches it directly
to the proxied request as headers when forwarding to `web`'s upstream — the exact same "already
in the bundle, no live tower call needed" principle Story 017's `/oauth2/providers` already
relies on, just applied to an outbound proxy call instead of a locally-served response. This
retires the `/_authstar/branding` endpoint ADR 0064 introduced — it's no longer needed.
`tenant.branding` (ADR 0020) is unchanged and still required; only how it reaches `web` changes.

### `/_authstar/upgrade` requires authentication — reuses the existing forwarded-JWT pattern, no new mechanism

Unlike `/oauth2/select`, this path is *not* exempt — the normal auth gate (Story 013) runs
first, and by the time portcullis proxies the request to `web`, a forwarded internal JWT is
already attached, exactly like any other authenticated `web` screen. `web` uses it to call
`keep`'s `plan-mappings`/`checkout-sessions` the same way `_admin` already calls backend
services for authenticated actions — nothing new here, this part of ADR 0065's original
reasoning was already correct. `keep`'s plans are tenant-scoped, not application-scoped (ADR
0038), so no per-application disambiguation is needed for this path the way login required.

### Failure handling differs by path, matching what already exists for each shape

- `/oauth2/select`: if `web` is unreachable, falls back to Story 018's own built-in, unbranded
  page — a genuine reliability improvement over ADR 0050/0064, which had no fallback at all if
  `_portal` itself went down.
- `/_authstar/upgrade`: no special fallback exists (there's no equivalent bare-bones upgrade
  flow) — an unreachable `web` produces the same `502`/`504` any other unreachable upstream
  already produces (Story 011), not a new failure mode to design for.

## Consequences

- **ADR 0050 and 0064 are superseded** — kept as a record of what was considered, not deleted.
- **ADR 0065** needs correcting (not superseding): its auth/mechanism reasoning survives
  unchanged; its `_portal`-hosted framing is replaced by the `/_authstar/upgrade` reserved path.
- **ADR 0044**'s "portcullis/keep redirect to them" language is now imprecise — proxy-through,
  not redirect — needs a correcting note.
- Story 001 (portcullis bundle): reverts the `auth.loginUrl` default computation, removes the
  `/_authstar/branding` endpoint, adds the global `webUpstream` field.
- Story 018: its fallback framing is corrected — reached when `web` is unreachable, not when an
  operator has overridden `auth.loginUrl`.
- New Story 023 needed for portcullis's actual proxy-through mechanics (both reserved paths).

## Related

- [ADR 0012](0012-rabbitmq-user-provisioning-job.md) (SPIFFE mTLS to first-party services, same pattern), [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0050](0050-portal-reserved-application.md), [ADR 0064](0064-portal-signin-flow.md), [ADR 0065](0065-portal-upgrade-flow.md)
