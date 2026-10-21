# ADR 0002: Multi-Tenant Architecture and Per-Tenant Key Management

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** portcullis, tower

> **Resolved 2026-08-02:** all three open research items below are now closed.
> Encryption-at-rest and valkey cache access control were both superseded outright by
> [ADR 0004](0004-signet-for-configuration-and-secrets.md) — signet's own storage replaced
> tower's durable store, and the valkey tier this ADR worried about access-controlling was
> retired entirely, so there's nothing left to control access to. The key-generation ceremony
> (onboarding half) is [ADR 0067](0067-tenant-creation-and-provisioning.md); the rotation half
> is [ADR 0080](0080-tenant-key-rotation-ceremony.md), which also confirms cross-tenant operator
> routes never touch the tenant key-resolution path at all.

## Context

Authstar's target deployment model is multi-tenant: one portcullis deployment (or fleet)
serves many tenants — distinct adopting applications, whether internal products built by
bytepunx or, longer-term, external customers of authstar as a paid SaaS product. Each tenant
needs isolated providers, CORS policy, cookie domain, upstream routing, and (per this ADR)
its own signing keys, resolved from the request's `Host` header. `ref-proxy` already has prior
art for host-based tenant resolution (`multi_state.rs`, `multi_middleware.rs`) — this ADR
governs how authstar's actual tenant/key data is sourced and kept fast, which the reference
does not address.

Tenant resolution has a hard ordering constraint: it must happen before session JWT
verification, because verification requires knowing *which tenant's* public key to check
against. This puts tenant resolution on the hot path for every request, authenticated or not —
a much higher-traffic path than claims enrichment (ADR 0001), which only runs for
authenticated requests.

## Decision

### Multi-tenant is the target architecture, not an add-on

Portcullis serves multiple tenants from one deployment, resolved by `Host` header per request.
This is the primary model going forward, not a mode bolted on top of a single-tenant default.

### Independent signing keys per tenant, per token purpose

Each tenant has **two** ES256 keypairs: one for session JWTs, one for internal JWTs (per ADR
0001's identity decisions — these were already logically separate; this ADR makes them
cryptographically separate too). A compromise or rotation of one tenant's or one purpose's key
has no effect on any other tenant or the other token type.

This matches how Auth0 and Okta operate: each tenant/org gets independent signing keys,
discoverable via a tenant-scoped key set, with `kid` selecting the active key during rotation.
There is no shared master key that signs end-user-facing tokens across tenants.

Rotation windows differ by token purpose given their TTL difference: internal-token keys can
be retired almost immediately after rotation (60-second token life tolerates a very short
overlap). Session-token keys must remain valid for verification until the longest-lived
outstanding cookie signed under them could naturally expire — up to `cookie.maxAge` (default
7 days).

### Two data-access tiers between portcullis and tower, not one

This is the key refinement over ADR 0001's blanket "enricher only calls tower's API, no direct
cache/DB access" rule. That rule is correct for user claims and stays unchanged. It does not
fit key/tenant-config data, for two reasons: portcullis must *sign* with private key material
on every request (not just verify), which requires fast local access rather than a live call
per signature; and tenant/key data changes rarely and deliberately (onboarding, rotation),
unlike claims data which can change from any admin action at any moment.

So there are two distinct access patterns, deliberately asymmetric:

- **Tenant operational config + key material** (providers, CORS, cookie domain, upstream
  routing, both signing keypairs — current and recently-rotated): tower is the authoritative
  writer, durably persisted (Postgres via consequent), and published into a **shared valkey
  instance** as a read-through cache tier. Portcullis reads valkey directly first; on a miss
  (cold start, eviction, brand-new tenant) it falls back to tower's API, which also primes the
  cache. This is portcullis reading tower's *cache tier*, not its system of record — tower
  remains the sole writer and source of truth, so this does not reopen the encapsulation
  concern ADR 0001 raised about reading tower's Postgres directly (which remains off-limits).
- **User claims (enrichment data)**: unchanged from ADR 0001 — always a live call to tower's
  API, never read from valkey or any portcullis-local cache. This is what preserves the
  guarantee that a `Deny` outcome (locked account, crossed threshold, etc.) takes effect on the
  very next request. Allowing claims to be served from a shared cache — even briefly — would
  reopen exactly the staleness risk ADR 0001 was written to close: a just-locked account could
  still read as allowed from a stale cached entry during a tower blip.

## Consequences

- **Story 001/002 (configuration)** need a dedicated redesign pass, not a patch. Static
  single-tenant YAML no longer describes tenant-level settings (providers, CORS, cookie
  domain, upstream, keys) — those now come from tower/valkey per tenant. What YAML/env config
  still governs at the process level (which valkey instance, which tower endpoint, listen
  port, etc.) versus what's fully tenant-dynamic is an open question, including whether a
  static-config single-tenant mode is worth preserving for local dev / self-hosted use, or
  whether even local/dev deployments should run a real (single-tenant) tower instance and go
  through the same dynamic path. **Not resolved here — needs its own discussion.**
- **Story 008/009/010** (session issuance, verification, internal token generation): key
  loading changes from "load static PEM files once at startup" to "resolve the tenant's
  current keypair (by tenant + `kid`) from valkey, falling back to tower on miss."
- **Story 013** (auth gate): tenant resolution from `Host` becomes the first stage of the
  decision flow, ahead of session JWT verification.
- Likely need a new story (analogous to Story 004's OIDC discovery) formalizing tenant
  resolution as a first-class per-request concern.

## Open Research Items

- Secrets handling for key material: encryption at rest in tower's durable store, access
  control for whatever process populates/reads the valkey cache, and the key-generation
  ceremony at tenant onboarding/rotation. Not designed yet. **All resolved — see the note at the
  top of this ADR.**
- Whether a static-config single-tenant mode is retained at all (see Story 001/002 consequence
  above).

## Related

- Refines the data-access rule in [ADR 0001](0001-claims-enrichment-via-tower.md) by splitting
  it into two tiers; the claims-enrichment rule itself is unchanged.
- Prior art: `~/git/authstar/ref-proxy/crates/authstar-middleware/src/multi_state.rs`,
  `multi_middleware.rs`
