# ADR 0016: Application Layer Nested Within Tenant; SSO Scope Limited to Shared-Parent-Domain

- **Status:** Accepted
- **Date:** 2026-07-22
- **Affects:** portcullis, tower

## Context

A tenant (an authstar customer/company) may operate multiple related products —
Stack Overflow's family of Q&A sites is the motivating example. Two distinct problems needed
separating: (1) should the same human be recognized as one account across those products
without independently registering on each, and (2) should a browser session on one product
carry over to another without re-authenticating. Conflating these led to the earlier framing
being incomplete — (1) is already solved by tenant-scoped identity resolution (settled in the
prior identity-actor discussion); (2) needs its own answer, given browser cookie scoping is a
hard boundary, not a config choice.

## Decision

### A new `application` layer, nested inside tenant

`application` is a new entity between tenant and identity: one distinct product (Math
Overflow, Cooking Overflow), with its own hostname(s), routing, and branding-adjacent config.
Tower models it as its own actor, key `{tenant}:{appSlug}`, with its own auditable lifecycle
(created, hosts changed, suspended, deleted) — the same reasoning as the tenant actor itself.

Portcullis's config gains one nesting level: `tenants.<slug>.applications.<appSlug>.*`.

### What stays at tenant level vs. moves to application level

**Tenant level** (shared across every application in the tenant — this is the load-bearing
constraint, not a convenience):
- Provider credentials (`clientId`/`clientSecret`/`discoveryUrl`/`scope`) — one OAuth
  registration per provider, shared; the operator registers every application's callback URL
  as an authorized redirect URI with the provider.
- Session and internal signing keypairs (ADR 0002) — must be shared, since a session token
  minted for one application has to verify as valid for another.
- Cookie config (`domain`/`path`/`maxAge`/`httpOnly`/`secure`) — must be one consistent value
  across applications for a session cookie to be shareable at all.

**Application level:**
- Hostname(s), `publicUrl` (used to construct each provider's `redirect_uri`).
- Upstream config (base, prefix routes, timeout).
- CORS origin.
- Exempt list.
- `auth.loginUrl`, and which subset (and order) of the tenant's providers this application
  exposes — provider *credentials* are tenant-level, but which providers a given application
  surfaces, and that application's own `loginPath`/`callbackPath` per provider, are its own.

### SSO scope: shared parent domain only

Portcullis supports session sharing across a tenant's applications **only** when their
hostnames are subdomains of the tenant's single shared cookie domain (e.g. `math.example.com`
and `cooking.example.com` under `.example.com`) — the browser already does this for free once
the cookie's `Domain` attribute is set to the shared parent.

An application whose hostname is **not** a subdomain of the tenant's cookie domain still
resolves to the correct, deduplicated account — identity resolution is tenant-scoped, not
cookie/domain-dependent — it just doesn't get silent SSO: the user authenticates there
separately, landing on the same underlying account once they do. This is a graceful
degradation that falls out of browser cookie scoping automatically, not a broken or
unsupported state, and requires no additional engineering.

A true cross-domain SSO broker (for applications on genuinely unrelated registrable domains,
requiring a central redirect-based session-bridging flow) is explicitly **out of scope**.
**Self-service identity linking** (the same human authenticating via different providers on
different applications) is also explicitly **deferred**. Both are tracked as candidates for
their own dedicated design passes, not designed here.

## Consequences

- **Story 001** needs a substantial rewrite: the `tenants` map gains a nested `applications`
  map; the tenant/application split above determines what moves where.
- **Stories 005, 006, 007, 009, 011, 012, 013, 017, 018, 019** need updating so that `Host`
  resolution becomes "resolve the application, then its owning tenant" instead of resolving a
  tenant directly, and so that upstream/CORS/exempt/provider-listing logic reads from the
  resolved application rather than the tenant.
- **Story 004** (OIDC discovery) is unaffected — discovery is inherently a tenant-level
  concern (shared provider credentials) regardless of how many applications use it.
- **Open question, not resolved here:** should claims enrichment (ADR 0001) become
  application-aware, so tower can return application-scoped roles (e.g. admin on Math
  Overflow, plain member on Cooking Overflow, same tenant, same account)? This depends on
  design work on tower's role model that hasn't happened yet — flagged for when that's
  designed, not decided now.

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md), [ADR 0014](0014-single-bundle-prefixed-tenant-keys.md)
