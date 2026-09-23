# ADR 0095: Portcullis Forwards Stripe Webhooks to Keep

- **Status:** Accepted
- **Date:** 2026-08-22
- **Affects:** portcullis
- **Related:** design/stories/keep/002-stripe-webhook-handling.md

## Context

keep's `POST /_authstar/webhooks/stripe` route (`webhooks.ts`) has always documented an explicit
assumption: it's reached only via portcullis, which resolves the tenant from `Host` and forwards
it as an `x-authstar-tenant-slug` header — "a future portcullis-facing story can confirm or
correct it." No such story had been built: portcullis's `Bundle` had `webUpstream`/`towerUpstream`
but no `keepUpstream`, and no `/_authstar/webhooks/*` route existed anywhere in
`authstar-middleware`/`authstar-proxy`. Discovered while setting up a real Stripe webhook
endpoint for the newly-adopted `bytepunx` tenant (bytepunx/authstar-tower#3's own follow-on,
bytepunx/authstar-keep#1) — the endpoint could be created and given a signing secret, but every
delivery would have 404'd.

## Decision

### New `keepUpstream` bundle field

`authstar-config::bundle::Bundle` gains `keep_upstream: Option<WebUpstreamConfig>` (camelCase
`keepUpstream` on the wire), following `webUpstream`/`towerUpstream`'s own precedent exactly: an
installation-wide, non-tenant-scoped address, optional so a bundle without it still parses (the
route 503s instead, matching `towerUpstream`'s own missing-config posture).

### New local route: `POST /_authstar/webhooks/stripe`

Registered via a new `webhook_routes()` function (`authstar-middleware::router`), merged into
`build_app` alongside `oauth_routes()` — **not** wrapped by `apply_auth_gate`. Stripe's own
webhook signature (verified downstream by keep against `config.webhookSecret`) is the actual
authentication for this route; portcullis has no session/OAuth concept to check here, and gating
it behind login would make Stripe's own deliveries impossible.

The handler (`authstar-middleware::webhooks::stripe_webhook_handler`):
1. Resolves the tenant from `Host` via `PortcullisState::resolve_active_host` (same ordering
   every local route uses — 404 unknown/deleted, 503 suspended).
2. Requires a `Stripe-Signature` header (400 if absent) — cheap enough to check here, though
   keep re-verifies it against the actual secret regardless.
3. Forwards the **raw, unparsed request body** to `{keepBaseUrl}/_authstar/webhooks/stripe`,
   with `Stripe-Signature` and `X-Authstar-Tenant-Slug` headers attached. The body must never be
   parsed/re-serialized — keep's signature verification is computed against the exact bytes
   Stripe signed, and any re-encoding would invalidate it.
4. Relays keep's response status and body back to Stripe verbatim (502 on transport failure, 503
   if `keepUpstream` isn't configured at all).

Reaches keep over `http_client` (the same plain, public-CA-verified-TLS client already used for
OIDC calls), not `tower_http_client` (SPIFFE mTLS) — keep never terminates mTLS itself, and
`http_client`'s TLS settings are simply inert against keep's plain in-cluster `http://` address.
Introducing a third client for this one call would add no real separation of concerns.

## Consequences

- **portcullis**: `keepUpstream` bundle field; `keep_base_url` on `PortcullisState`/`build_state`
  (new required parameter — every direct `PortcullisState` construction and `build_state` call
  in the test suite needed updating); `webhooks.rs` + `webhook_routes()`.
- **cluster-secrets**: `config/authstar-platform/portcullis.yaml` needs a new top-level
  `keepUpstream: { address: "http://keep.authstar-platform.svc.cluster.local:8080", timeout: 10 }`
  entry — additive, no change to the existing hand-authored `tenants:` map.
- **keep**: unaffected — its own `x-authstar-tenant-slug` assumption is now actually true.
- Unblocks bytepunx/authstar-keep#1's Stripe webhook configuration for the `bytepunx`/`loci`
  integration once the config above is deployed.
