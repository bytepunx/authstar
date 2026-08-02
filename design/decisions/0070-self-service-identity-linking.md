# ADR 0070: Self-Service Identity Linking

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** portcullis, tower, web
- **Resolves the deferred item in:** [ADR 0016](0016-application-layer-and-sso-scope.md)

## Context

ADR 0016 deferred this explicitly but left a binding constraint for whenever it got designed:
linking must require **live, simultaneous proof of control of both identities in one
continuous, server-correlated flow** — the user already authenticated to the existing account,
then a fresh OIDC round-trip for the new identity, correlated server-side; email matching is a
hint only, never authorization.

The data model already supports this with no changes: `identity.accountId` (ADR 0027) is
already 1:N — nothing constrains one account to a single `identity` record, and ADR 0056's
export already enumerates "every `identity` linked to an account" in the plural. The gap is
purely the missing **write path**: nothing today lets a second identity be created pointing at
an *already-existing* accountId rather than resolving-or-creating a new one.

## Decision

### Initiation — a new protected route, reusing the existing per-provider redirect mechanism

`GET /oauth2/{name}/link` — registered per-application alongside the existing `/oauth2/{name}/
login` (Story 005), for each provider that application exposes. Unlike `/login`, this is a
**protected** route — an unauthenticated visitor is simply redirected to normal login by Story
013's existing gate, no new logic there. It performs the identical redirect-to-IdP mechanics as
`/login` (`state`/PKCE cookies, Story 005), plus one addition: a short-lived `oauth2-link-mode`
`httpOnly` cookie (same scoping discipline as the existing flow cookies) marking this specific
round-trip as a linking flow rather than a login.

### Callback — branches on the link-mode cookie, never falls through to account creation

`/oauth2/{name}/callback` (Story 006, unchanged for ordinary logins) gains a branch: if
`oauth2-link-mode` is present (read and cleared immediately, same discipline as `state`/PKCE),
this is a linking callback.

- **Re-verify the current session JWT is still valid** — re-derive `accountId` from it, never
  from anything set during initiation. If the session is no longer valid (e.g. the user logged
  out mid-flow), the attempt is aborted outright with an error. This callback must **never**
  fall through to ordinary resolve-or-create account handling — a silent new-account creation
  here would be a orphaned, unlinked account, and worse, a plausible path to attaching an
  identity to the wrong account if the session state is stale or manipulated.
- Compute the new identity's `identityHash` exactly as an ordinary login does (ADR 0027) — no
  new hashing scheme.
- Store `{ identityHash, idp }` in a new short-lived `oauth2-pending-link` `httpOnly` cookie and
  redirect to `/_authstar/link/confirm` — **not** an immediate commit.

### Explicit confirmation step before the link is persisted

The pending link is not written until the user confirms — a real, cheap mitigation against the
one residual risk this flow has: a CSRF-forced navigation to `/oauth2/{name}/link` could start a
round-trip the user never intended (in practice requiring the attacker to already be
authenticated to their own IdP within the victim's own browser, an unusual precondition, but not
one worth dismissing given ADR 0016's explicit security emphasis on this exact feature). `/
_authstar/link/confirm` is a new reserved path, proxied to `web` exactly like `/_authstar/
upgrade` (ADR 0066) — requires auth, tenant-branded, uses the same header-attachment mechanism
ADR 0066 already established (portcullis attaches the pending link's `idp` name as a request
header, no live tower call needed for `web` to render "Link your {idp} account?"). Confirm posts
to a portcullis-owned (not proxied) `POST /_authstar/link/confirm`, which reads the identityHash
**only** from the `oauth2-pending-link` cookie — never from the client's request body — and
re-derives `accountId` from the current session JWT, same as the callback did. Cancel simply
clears the cookie.

### New tower endpoint — portcullis-mTLS-authenticated, same trust boundary as enrichment

`POST /identity-links` — body `{ tenant, accountId, identityHash, idp }`. This sits on tower's
existing third auth model (ADR 0030: SPIFFE mTLS, service-to-service, not a tenant-scoped
`permissions`-gated call and not the operator API), alongside the enrichment endpoint, since
it's portcullis-only exactly like enrichment is.

- `identityHash` unclaimed → create the `identity` actor, ADR 0027's exact shape, with the
  supplied `accountId`.
- `identityHash` already resolves to this same `accountId` → idempotent success (already
  linked — a harmless re-link, e.g. re-authenticating the same provider).
- `identityHash` already resolves to a **different** `accountId` → `409 Conflict`. This does
  **not** trigger any account-merge behavior — merging two pre-existing accounts is a
  substantially harder problem (reconciling roles, entitlements, contact records, history) than
  linking, and is explicitly out of scope here, flagged as its own future question if it's ever
  actually needed. Portcullis surfaces a clear "this sign-in is already linked to a different
  account" message.

### Self-action needs no `permissions` grant — a principle worth naming once

Reading or removing your **own** linked identities is the first genuinely self-service,
non-admin account action in this design (ADR 0056's `/me/export` was flagged but deferred without
resolving this). Rather than inventing a scoped grant for it, the simpler and correct rule:
**any tenant-scoped account route where `{accountId}` matches the caller's own resolved
`accountId` is permitted without holding any `permissions` grant** — self-action never needs
admin authorization; only acting on a *different* account does. New routes:

- `GET /tenants/{tenantSlug}/accounts/{accountId}/identities` — list `{ idp }` per linked
  identity (no raw subject, tower never has it). Self, or an admin holding `accounts:manage`.
- `DELETE /tenants/{tenantSlug}/accounts/{accountId}/identities/{identityHash}` — self, or an
  admin holding `accounts:manage`. **Refuses if it would remove the account's last identity** —
  the same lockout safeguard shape as ADR 0067's provider-removal fix; an account must always
  retain at least one way to sign back in.

### UI — no widget designed here, two valid entry points

An adopting application can link directly to `/oauth2/{name}/link` itself, exactly as it already
links to `/oauth2/{name}/login` — no widget required. The natural richer home is a "linked
sign-in methods" section in the account-summary embeddable widget (ADR 0044's inventory,
designed next) — flagged as that widget's concern, not designed here.

## Consequences

- Portcullis: new per-application `/oauth2/{name}/link` route, callback branch, two new
  short-lived cookies, new `/_authstar/link/confirm` GET (proxied) and POST (owned) routes.
- Tower: new `POST /identity-links` on the portcullis-mTLS surface; two new tenant-scoped
  routes with the new self-action-needs-no-permission rule.
- `web`: one new proxied confirmation page.
- Account merging remains explicitly unresolved — a harder, separate future question.
- Analytics' same-person-via-two-providers gap (ADR 0035) is unaffected — chronicle still only
  ever sees `identityHash`, and linking doesn't retroactively correlate historical events.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0027](0027-portcullis-computed-identity-hash.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0035](0035-lookout-and-chronicle-analytics.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0056](0056-gdpr-data-export.md), [ADR 0066](0066-portcullis-proxies-branded-pages-to-web.md), [ADR 0067](0067-tenant-creation-and-provisioning.md)
