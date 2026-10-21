---
id: ADR-0089
title: The Internal JWT Carries Its Own Tenant Hint
status: accepted
date: 2026-08-14
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0089: The Internal JWT Carries Its Own Tenant Hint

- **Status:** Accepted (JWKS URL construction superseded by [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md))
- **Date:** 2026-08-14
- **Affects:** portcullis, authstar-clients, tower, keep, herald, web

> **Superseded 2026-08-19:** the `https://admin.<tenant-slug>.<baseDomain>/.well-known/
> jwks.json` construction below assumed every tenant's host was mechanically derivable from its
> slug via one shared `baseDomain` — it isn't, once tenants bring their own unrelated domains.
> [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md) replaces the
> `baseDomain` string `perTenantJwksKeyProvider` took with a tower-backed, cached slug→domain
> resolver, and the URL becomes `https://authstar.<resolved domain>/.well-known/jwks.json`. Why
> the tenant hint lives in the JWT's protected header at all (this ADR's actual subject, the
> choice between a forwarded header and a self-contained hint) is unaffected.

## Context

Every backend service that independently re-verifies the internal JWT (ADR 0030's "defense in
depth") needs to resolve the *correct tenant's* public key before it can check a signature —
portcullis serves JWKS per-tenant, `Host`-resolved (ADR 0086/0087). Portcullis itself always
knows the tenant, because it resolves it from `Host` before anything else happens (ADR 0002).
Every other service has no equivalent signal: tower, keep, herald, and web are each one shared
deployment serving every tenant, reached at their own fixed internal address (a Kubernetes
Service DNS name, not a tenant's branded host) — nothing about *how* a request arrives tells
these services which tenant it's for.

Two candidate fixes were considered:

**A. Portcullis forwards a trusted header** (e.g. `X-Authstar-Tenant`) on every proxied request,
which the upstream trusts because the channel it arrived on is authenticated. `web`'s own code
already informally assumes exactly this (`hooks.server.ts`'s own comment: *"this repo's own
documented header-name assumption"*) — but nothing has ever specified it, and checking closely,
the channel it would need to be trusted on doesn't exist: portcullis's *general* reverse-proxy
path (`authstar-proxy/src/proxy/mod.rs`'s `proxy_handler`) forwards through `state.http_client`,
the plain public-CA-verified-TLS client meant for third-party OIDC providers — not
`state.tower_http_client`, the SPIFFE-mTLS-configured one, which is only ever used for
portcullis's two *direct* synchronous calls (`/enrich`, `/identities/resolve`). A header
forwarded over that path is not currently trustworthy, and making it trustworthy would mean
mTLS-authenticating portcullis's reverse proxy to every upstream — including, structurally,
*arbitrary tenant-configured backends* that have no SPIFFE identity to mTLS against, forcing a
special case between "this upstream is one of our own services" and "this upstream is the
tenant's own product."

**B. The token carries its own tenant hint, self-contained — no new trust channel needed.** A
service reads it, constructs that tenant's JWKS URL, fetches, verifies. This is safe to do
*before* signature verification completes, for the same reason `kid`-based key selection already
is: an unverified hint is only ever used to pick which key to *attempt* verification with — a
forged hint, a forged signature, or a hint/signature mismatch all just fail verification the
normal way. Confirmed directly against `jose`'s own types (`GenericGetKeyFunction`): the
`getKey` callback receives `(protectedHeader, token)` with the explicit doc comment *"No token
components have been verified at the time of this function call"* — this is an intended,
standard extension point, not a novel trick.

**Decision: B.** It requires no prerequisite (mTLS to every upstream), no special-casing between
internal and external upstreams, and matches this design's own stated posture (ADR 0030:
upstreams verify independently, they don't trust what portcullis forwards).

## Decision

A new `tenant` field on the internal JWT's **protected header** — not the payload.

### A new `tenant` field on the internal JWT's **protected header** — not the payload

Alongside `alg`/`kid`/`typ`, the internal JWT's header gains `tenant: string` (the tenant slug,
e.g. `"acme"`) — set by `sign_internal` (`authstar-middleware/src/jwt/internal.rs`) at the same
point `kid` already is, since portcullis always already knows the tenant when minting this token
(it's the same tenant the request's `Host` resolved to). The **header**, not the payload, for
the same reason `kid` lives there: it's metadata needed to know *how* to verify, read before
verification succeeds — not a claim about the token's subject. This is an additive change to a
JSON object; no existing verifier that doesn't look for `tenant` is affected (same reasoning
ADR 0087 already used for adding `publicKeyPem` to the JWKS response).

The session JWT is unaffected — only portcullis itself ever verifies it, and portcullis already
knows the tenant at that point by construction (ADR 0002). It also already carries the tenant
slug as `aud`, a standard claim, for an entirely different reason (audience validation) — no
change needed there.

### JWKS URL construction: `https://admin.<tenant-slug>.<baseDomain>/.well-known/jwks.json`

Reuses the one host guaranteed to exist for every tenant — the auto-created `_admin`
application's host (ADR 0067's provisioning flow, `admin.<slug>.<baseDomain>`) — rather than
inventing a third hostname convention. A service only needs one small piece of static
config, its own copy of `baseDomain` (tower already has this, `ProvisioningConfig.baseDomain`;
keep/herald/web need it added for this purpose specifically).

**Judgment call, named rather than hidden**: if an operator ever repoints the `_admin`
application's own host away from this convention (via the applications-management route, once
[tower Story 004](../stories/tower/004-applications-and-providers.md) is implemented), JWKS
resolution for that tenant breaks for every downstream service at once. Accepted for this pass —
narrow, operator-caused, and the same category of trade-off ADR 0086 already accepted for the
JWKS route's own network-scoping. A more robust fix (a JWKS-specific host portcullis resolves
independent of any application's configured hosts) is possible later without changing this
ADR's wire format at all, only where the URL points.

### Client library: `perTenantJwksKeyProvider`, not a new manual two-step dance

`@bytepunx/authstar-core` gains `perTenantJwksKeyProvider(baseDomain, options?)`, implementing
`JWTVerifyGetKey` directly: read `protectedHeader.tenant`, construct that tenant's JWKS URL,
delegate to a `createRemoteJWKSet` cached per-tenant for the life of the process (so a
high-traffic tenant doesn't re-fetch JWKS every request, matching `jwksKeyProvider`'s existing
single-URL behavior). Call sites don't need to know or care that resolution happens inside the
`getKey` callback rather than before it.

`verifyInternalJwt`'s returned claims gain a `tenant: string` field — sourced from the
**verified** protected header (read only after `jwtVerify` itself succeeds, from
`result.protectedHeader.tenant`), not re-trusted from the pre-verification read. Callers get an
ergonomic `claims.tenant` without needing to know part of it came from the header rather than
the payload.

### `web`'s existing `x-authstar-tenant` assumption is wrong, not merely incomplete

It should be removed, not extended — there was never a mechanism that would have set it, and
this ADR replaces the need for any forwarded header at all. Tracked as a follow-up fix once this
lands, alongside `web` gaining the same `perTenantJwksKeyProvider`-based resolution tower/keep/
herald need (currently `web` only supports one static `INTERNAL_JWT_JWKS_URL`, unable to serve
more than one tenant correctly even after the claim-parsing fixes already shipped).

## Consequences

- `authstar-middleware`: `sign_internal`/`allow_claims`/`degraded_claims` gain a `tenant`
  parameter, set on the JWT header at sign time. Small, additive, no behavior change for
  anything not reading the new field.
- `authstar-clients`: `@bytepunx/authstar-core` gains `perTenantJwksKeyProvider`;
  `InternalClaims`/`verifyInternalJwt`'s return shape gains `tenant`.
- `tower`/`keep`/`herald`: [Story 014](../stories/tower/014-permission-enforcement-middleware.md)/
  [keep Story 007](../stories/keep/007-permission-enforcement-middleware.md)/
  [herald Story 006](../stories/herald/006-permission-enforcement-middleware.md)'s open
  "how does a non-Host-routed service resolve which tenant's JWKS to use" question is resolved
  by this ADR — their own permission-enforcement middleware can now be implemented using
  `perTenantJwksKeyProvider` instead of blocking on it. keep/herald need `baseDomain` added to
  their own config, matching tower's existing `ProvisioningConfig.baseDomain`.
- `web`: needs a follow-up fix — remove the `x-authstar-tenant` assumption, adopt
  `perTenantJwksKeyProvider`. Not done as part of this ADR; tracked separately.
- No change to the session JWT, and no change needed to portcullis's own verification of it.

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md) (tenant resolution by `Host`,
  the thing non-portcullis services structurally lack)
- [ADR 0030](0030-tower-api-surface.md) ("defense in depth" — the reason this needs to work at
  all without trusting a forwarded signal)
- [ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md) / [ADR 0087](0087-jwks-response-includes-pem-alongside-jwk-point.md) (the JWKS endpoint this resolves *to*)
- [ADR 0067](0067-tenant-creation-and-provisioning.md) (the `_admin` application host convention this reuses)
- [tower Story 014](../stories/tower/014-permission-enforcement-middleware.md), [keep Story 007](../stories/keep/007-permission-enforcement-middleware.md), [herald Story 006](../stories/herald/006-permission-enforcement-middleware.md) (unblocked by this ADR)
