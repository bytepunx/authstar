# ADR 0064: `_portal`'s Sign-In Flow — Application-Scoped, Fully Client-Fetchable

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** portcullis, tower, web
- **Depends on:** [ADR 0050](0050-portal-reserved-application.md)

## Decision

### Each application's `auth.loginUrl` default carries an explicit `?app=` identifier

Not inferred from a cookie or any other implicit signal — `math`'s default `auth.loginUrl`
becomes `_portal`'s host plus `?app=math` (e.g. `https://accounts.acme.example.com/login?app=math`),
`cooking`'s carries `?app=cooking`. `_portal`'s login page reads this to know which
application's provider list and login paths to render. Explicit and robust: it works even if
someone bookmarks or directly visits `_portal`'s login URL without ever having hit a protected
page first, which an inferred-from-cookie approach wouldn't.

### `_portal` has no OAuth login/callback machinery of its own — it only links out

The login page calls the *target application's* own `GET /oauth2/providers` (Story 017,
unchanged) and renders links pointing directly at that application's own
`/oauth2/{provider}/login` paths. The browser navigates away from `_portal` entirely to complete
the OAuth flow on the originating application's own host — `_portal`'s entire job is picking a
provider and linking out, nothing more.

### Story 007's return-cookie mechanism needs no changes — confirmed, not assumed

Traced through deliberately rather than left implicit: `authstar-return` is set on the tenant's
shared cookie domain (ADR 0016) by whatever application the user was originally trying to
reach, and is read later by *that same application's own* OAuth callback (Story 006/007) — never
by `_portal`, which the login link bypasses entirely. Since the callback always runs on the
originating application's own host, a relative-path redirect naturally resolves correctly
without needing the cookie to carry host information it doesn't have today.

### Fully client-fetchable — no new service-to-service credential needed

Checking how `/oauth2/providers` (Story 017) actually works settled this cleanly: it's served
entirely from portcullis's own in-memory bundle, no live tower call at request time. The same
pattern extends to tenant branding: `tenant` gains a `branding` field (`name`, `logoUrl`,
`primaryColor`) in tower, flows into portcullis's bundle (Story 001) the same way `providers`
already does, and portcullis serves it via a new reserved, exempt, local endpoint —
`GET /_authstar/branding` — the same category as `/_authstar/usage` and `/_authstar/analytics/events`.

This means `_portal`'s login page needs **no authenticated backend call at all** — the browser
fetches `/_authstar/branding` (on `_portal`'s own host) and the target application's
`/oauth2/providers` (cross-origin, already public/exempt) directly. No new service-level
credential for `web`'s backend to reach tower unauthenticated was needed — the existing
"serve public data from portcullis's own bundle" pattern already solved it.

## Consequences

- Story 001 (portcullis bundle) gains `tenants.<slug>.branding` and a computed, explicit
  `?app={appSlug}` default for each application's `auth.loginUrl`.
- New portcullis-local reserved route, `GET /_authstar/branding`.
- `tenant` (tower) gains a `branding` field.
- Story 018's built-in `/oauth2/select` page becomes a true fallback-only mechanism (already
  noted in ADR 0050) — the computed default now points at `_portal`, not `/oauth2/select`.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0017](0017-account-identity-and-role-model.md), [ADR 0050](0050-portal-reserved-application.md)
