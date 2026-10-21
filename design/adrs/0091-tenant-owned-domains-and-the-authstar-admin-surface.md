---
id: ADR-0091
title: Tenant-Owned Domains and the Reserved `authstar` Admin Surface
status: accepted
date: 2026-08-19
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0091: Tenant-Owned Domains and the Reserved `authstar` Admin Surface

- **Status:** Accepted (domain-at-creation requirement superseded by [ADR 0093](0093-domain-pending-tenant-provisioning.md))
- **Date:** 2026-08-19
- **Affects:** tower, portcullis, web, steward, authstar-clients
- **Supersedes:** the `_admin`/`admin.<slug>.<baseDomain>` convention in [ADR 0067](0067-tenant-creation-and-provisioning.md),
  the `_admin` reserved-application framing in [ADR 0044](0044-web-surfaces-and-distribution-model.md), and the
  JWKS URL construction in [ADR 0089](0089-internal-jwt-carries-its-own-tenant-hint.md)
- **Related:** [ADR 0002](0002-multi-tenant-architecture-and-key-management.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0068](0068-tenant-creation-ui-surfaces.md), [ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md)/[ADR 0087](0087-jwks-response-includes-pem-alongside-jwk-point.md)

## Context

Standing up the first real tenant beyond the migration-era `bytepunx` tenant surfaced that
`_admin`'s host convention (`admin.<slug>.<baseDomain>`, ADR 0067) doesn't actually work: the
variable tenant slug sits in the *middle* of the hostname, and DNS wildcards only ever match a
single leftmost label. No wildcard rule, however many are added, can cover that shape for an
arbitrary number of tenants — every tenant would need its own DNS record, indefinitely, by
construction of the naming scheme itself, not as an operational inconvenience that automation
could paper over.

Two alternatives were explored and rejected before this one:

- **A hyphenated, single-label host per (tenant, surface)** (`<slug>-admin.bytepunx.com`) avoids
  the DNS-depth problem by riding the existing `*.bytepunx.com` wildcard, but invents a naming
  convention that doesn't match the model every other application in this system already follows
  (each application is a subdomain of *its tenant's own* root domain — proven live by the
  `bytepunx` tenant's four applications sharing one SSO cookie today). It also does nothing for
  tenants that bring their own domain rather than living under `bytepunx.com` at all.
- **A single shared, tenant-agnostic host with path-based tenant selection**
  (`authstar.bytepunx.com/<slug>/...`) matches `web`'s own already-host-agnostic design (it
  resolves tenant from the internal JWT, never from `Host`), but requires genuinely new routing
  and session-isolation logic in portcullis — today, *every* tenant-resolution mechanism in the
  system (the OAuth gate, the session cookie, JWKS serving) is `Host`-keyed with no exceptions,
  and moving admin traffic onto a single shared origin trades the isolation portcullis currently
  guarantees by construction (separate origins per tenant) for isolation that depends entirely on
  new server-side code being correct.

Neither is necessary. The actual constraint isn't "the admin surface needs its own host
convention" — it's that a cookie domain can never be shared between two tenants (the session
cookie's name is fixed, not tenant-scoped), so each tenant needs an *exclusive* namespace. If
tenants are simply required to have a domain each, and that domain is unique across the whole
installation, the admin surface's host becomes trivially unique too, using the exact routing
mechanism portcullis already has.

## Decision

Every tenant has exactly one domain, globally unique across the installation.

### Every tenant has exactly one domain, globally unique across the installation

Tenant creation (`POST /tenants` on tower) requires a `domain` field, separate from `slug`, and
enforced unique the same way `slug` uniqueness already is. `slug` remains the internal identifier
everywhere it already is (consequent's `tenant` actor key, portcullis's bundle map key, ADR
0020) — this ADR does not change that. `domain` is new, purely a routing/DNS fact about the
tenant. In the common case this is a domain the tenant itself owns and points at the cluster; for
an installation that only ever expects one tenant (the stated common case for this system), this
is a one-time setup cost, not an ongoing one.

### `authstar` is reserved — never a valid tenant slug or application slug

Alongside the existing reservation on `_admin` (ADR 0044), no tenant may take the slug
`authstar`, and no application within any tenant may either. This prevents any ambiguity between
"a tenant's own application" and the platform's own reserved surface.

### The reserved admin application's host: `authstar.<tenant's domain>`

Tower's provisioning auto-creates a reserved application (slug `authstar`, replacing `_admin`)
exactly as ADR 0044/0067 already established — same auto-creation, same "never deletable," same
"authenticates via the tenant's own OIDC provider, gated by that account's `permissions`, no
special-casing" posture. Only the host convention changes: `authstar.<tenant.domain>` instead of
`admin.<slug>.<baseDomain>`, registered as a normal entry in that tenant's `applications` map —
**no portcullis code changes of any kind**. `resolve_host`'s lookup (`authstar-middleware/src/
state.rs`) is a flat `host -> (tenant, application)` index built from whatever strings appear in
any application's `hosts`; it has never assumed those strings relate to each other, and
`validate.rs`'s existing duplicate-host rejection continues to guarantee this host is claimed by
exactly one tenant. Given domain uniqueness (this ADR's first decision), `authstar.<domain>` is
globally unique by construction — one DNS record per tenant, the same shape of work registering
that tenant's domain at all already requires, not additional one-off configuration on top of it.

### Tenant-level config collapses onto one field: `domain`

`cookieDomain` (currently computed as `<slug>.<baseDomain>`, ADR 0067) becomes simply
`.<tenant.domain>` — the same pattern already proven live by the `bytepunx` tenant's own
`.bytepunx.com` cookie, just derived from the tenant's own domain instead of a shared
installation-wide `baseDomain`. This is a genuine simplification: `baseDomain` as a shared,
installation-wide config value is no longer needed for tenant-hostname purposes anywhere in this
system.

### JWKS resolution: a tower-backed, cached slug→domain lookup, not a shared-domain template

ADR 0089's `perTenantJwksKeyProvider(baseDomain, options?)` templated a *shared* domain with the
tenant slug (`admin.<slug>.<baseDomain>`) — that only worked because every tenant's host was
mechanically derivable from its slug. Once tenants bring unrelated domains, there is no formula
from slug to host; it requires a real lookup. `perTenantJwksKeyProvider` changes signature to
take a resolver instead of a string:

```ts
perTenantJwksKeyProvider(
  resolveDomain: (tenantSlug: string) => string | undefined | Promise<string | undefined>,
  options?: PerTenantJwksKeyProviderOptions,
): JWTVerifyGetKey
```

Each consumer (tower, keep, herald, web) supplies a resolver backed by tower's own tenant lookup
(tower is the source of truth for `domain`), cached per-process — tenants are added infrequently
and a resolver is only consulted when a *new* tenant slug is seen, so this is not a per-request
network dependency in the common case, and it never requires a redeploy to pick up a newly
created tenant. Constructed URL: `https://authstar.<resolved domain>/.well-known/jwks.json`.

This is an additive-in-spirit but breaking-in-signature change to `@bytepunx/authstar-core` —
every current call site (tower's `build-app.ts`, and `web` once it adopts this ADR) updates
together. ADR 0089's own reasoning for *why* the tenant hint lives in the JWT's protected header
rather than a portcullis-forwarded header is unaffected and still holds — this ADR only changes
what a service does with that hint once read, not how it gets there.

### Invite links resolve through the target tenant's own domain, nothing else

`resolveInviteHost` (`tower/src/routes/invites.ts`) simplifies: a tenant-wide invite resolves to
`authstar.<tenant.domain>`; an application-scoped invite continues to use that application's own
`hosts[0]`. No `baseDomain` fallback is needed — every tenant has a domain by construction now.

### One account, multiple tenants: isolation is free, not designed

An admin who administers more than one tenant simply has separate sessions on separate domains —
the browser's own origin isolation, unchanged from how every other multi-application login in
this system already works. No new mechanism, no shared session, no risk of one tenant's session
leaking into another's.

## Resolved 2026-08-19 (were open items)

- **Self-service signup and domain-less tenants.** *Superseded 2026-08-20 by
  [ADR 0093](0093-domain-pending-tenant-provisioning.md)* — domain becomes optional at creation
  after all, with a domain-pending state and a later completion step, rather than required
  unconditionally as first decided here.
- **Invite redemption via OIDC login.** Resolved by [ADR 0092](0092-invite-redemption-survives-the-oauth-round-trip.md),
  implemented alongside this ADR rather than deferred — admin onboarding (this ADR's whole point)
  doesn't actually work end to end without it.
- **Inviting additional admins to an existing tenant.** steward gains a screen for this
  (see Consequences) — tower's `POST /tenants/:slug/invites` already supported it; only the UI was
  missing.

## Consequences

- **tower**: new `domain` field + uniqueness validation on tenant creation; provisioning computes
  `authstar.<domain>` instead of `admin.<slug>.<baseDomain>` and no longer needs
  `ProvisioningConfig.baseDomain` for hostname purposes; `cookieDomain` computation changes to
  `.<domain>`; `resolveInviteHost` drops its `baseDomain` fallback; reserved-application slug
  changes from `_admin` to `authstar`; `authstar` becomes a reserved tenant slug.
- **portcullis**: no code changes. `authstar.<domain>` is an ordinary application host in the
  existing per-tenant `applications` map.
- **authstar-clients** (`@bytepunx/authstar-core`): `perTenantJwksKeyProvider` signature change
  (string → resolver function) — a new package version; every consumer updates its call site.
- **web**: adopts the new resolver-based provider (this is also the fix for the pre-existing,
  separately-tracked gap where `web`'s deployment has neither `INTERNAL_JWT_JWKS_URL` nor a
  working per-tenant resolution configured, and currently treats every request as
  unauthenticated); no longer reachable at any `admin.*`/`_admin`-flavored host.
- **steward**: the Create Tenant screen gains a required `domain` field; a new screen lets the
  operator invite additional admins to an existing tenant by email (calling tower's existing
  `POST /operator/tenants/:slug/invites`); the tenant detail page surfaces the resolved
  `authstar.<domain>` URL so the operator can reach that tenant's `web` console directly rather
  than reconstructing it by hand.
- **Operational**: registering a new tenant requires one DNS record for `authstar.<domain>` in
  that tenant's own domain — the same shape of work bringing a tenant's domain under this
  installation already requires, not an additional one-off step layered on top of it. Confirmed
  against Cloudflare's own documentation that a single `cloudflared` tunnel/config already
  supports arbitrary additional hostnames, including domains not managed by Cloudflare's own DNS
  (CNAME-based "partial setup") — no new tunnel instance or architecture needed as tenant domains
  are added.

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) (tenant resolution by `Host`, unchanged)
- [ADR 0020](0020-tenant-application-actors-and-secret-handling.md) (`slug` as the actor key, unchanged)
- [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0067](0067-tenant-creation-and-provisioning.md), [ADR 0068](0068-tenant-creation-ui-surfaces.md) (superseded in part, see above)
- [ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md)/[ADR 0087](0087-jwks-response-includes-pem-alongside-jwk-point.md), [ADR 0089](0089-internal-jwt-carries-its-own-tenant-hint.md) (JWKS mechanism reused; URL construction superseded)
