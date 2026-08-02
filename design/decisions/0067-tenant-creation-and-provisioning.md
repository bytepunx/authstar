# ADR 0067: Tenant Creation and Provisioning API

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, portcullis, herald
- **Resolves the long-open item in:** [ADR 0021](0021-cli-operator-bootstrap.md)

## Context

Every ADR since 0021 has assumed a tenant already exists. Nothing has ever specified how the
very first one comes into being — for a self-hosted install, or for a genuine hosted-SaaS
signup flow, which is a stated long-term goal for this system. Designing this surfaced a real
bootstrap problem specific to self-service: a brand-new tenant has zero OIDC providers
configured, so a bootstrap invite (ADR 0021's existing mechanism) is unredeemable without
something to authenticate against.

## Decision

### `POST /tenants` on tower — a new route category, neither tenant-scoped nor operator-only

Reachable two ways: the operator bearer token (via `steward`, always allowed, same posture as
every other operator action), or **unauthenticated**, only when the installation's self-service
flag is enabled. Both paths converge on the same underlying creation logic — they differ only in
auth gate and which fields the caller may override.

### New installation-level (not tenant-scoped) config in tower's own bundle

```yaml
provisioning:
  selfServiceEnabled: false   # default off
  baseDomain: authstar.app     # for auto-generated subdomains
  defaultProvider: { name: '', clientId: '', discoveryUrl: '', scope: [] }
```

plus a new secret, `default-provider-client-secret`, in tower's own bundle. `selfServiceEnabled`
and `baseDomain` are operator-configurable via `steward` (ADR 0068). Defaulting self-service to
**off** matters: a self-hosted adopter running authstar for their own single business almost
certainly does not want the internet able to provision new tenants on their private
infrastructure — this has to be an explicit opt-in, not a default.

### Reachable via tower's own direct ingress — bypasses portcullis entirely

This request is inherently pre-tenant — there is no `Host` to resolve a tenant from, which is
the very first thing every other portcullis-mediated request does (ADR 0062). Rather than
teaching portcullis a "no tenant" mode that would complicate its carefully-built,
tenant-resolution-first architecture, tower exposes `POST /tenants` on its own direct ingress
(own Kubernetes Service/Ingress, TLS via cert-manager) — the same shape keep's Stripe webhook
briefly needed before it became tenant-scoped and moved behind portcullis (ADR 0041/0046). This
one stays permanently pre-tenant, so it stays on its own ingress.

### What tenant creation actually does

1. Validate `slug` uniqueness (free via consequent's own business-key enforcement — `tenant` is
   keyed by `slug` directly, ADR 0020) and format (the same delimiter-safe character set already
   required elsewhere, ADR 0002).
2. Create the `tenant` actor.
3. **Seed `providers` with the installation's `defaultProvider`** — copied (not referenced) into
   the new tenant's own provider config, so the first login works immediately without the
   creator needing their own registered OAuth app. This is a real, deliberate trade-off: copying
   is simpler than a reference-resolution mechanism (nothing downstream — portcullis, Story
   004's discovery, anything — needs to know this entry is "shared"), at the cost that rotating
   the installation's default provider credentials later does **not** automatically update
   already-created tenants that copied the old value. Named explicitly, not silently accepted.
4. Auto-create `_admin` (ADR 0044) — host `admin.{slug}.{baseDomain}` (a distinguishable
   convention, freeing `{slug}.{baseDomain}` bare for whatever the tenant's own first product
   application later wants). An operator-authenticated caller may override this with their own
   domain directly; a self-service caller always gets the auto-generated one, since they don't
   have domain infrastructure ready by definition.
5. Generate and push the four per-tenant secrets: session and internal signing keypairs (ADR
   0002) and an initial `identity-hash-key` generation (ADR 0027) to **portcullis's** bundle;
   `contact-hash-pepper` (ADR 0023) to **tower's own** bundle. This confirms and makes explicit
   something left implicit before: tower's existing elevated `SyncBundle` access (ADR 0011) —
   originally described as authoring portcullis's bundle on its behalf — also covers writing to
   tower's own bundle, needed here for an ongoing, per-tenant-creation operation, not just a
   one-time deploy-time secret.
6. Issue the first admin's access by **reusing ADR 0021's elevated-invite mechanism exactly** —
   no second bootstrap path invented. The invite targets the caller-supplied `adminEmail`,
   granting full tenant `permissions`.
7. Publish through herald's **already-existing** `comms.transactional.invite-sent` type (ADR
   0022) — no new herald mechanism needed for this at all.

### Provider-removal safeguard, found while designing the seeded-default case

If a tenant admin can freely remove the seeded default provider before adding their own, they
can lock themselves out entirely. Fix: tower's provider `DELETE` (already a soft status
transition, ADR 0053) refuses if it would leave zero providers active and exposed by `_admin`
specifically — a real, small addition surfaced by this design, not present before.

### Rate limiting and abuse prevention — named, not fully specified

The self-service path needs protection against scripted mass creation (by IP and/or
`adminEmail`), consistent with how other abuse-prevention concerns in this design have been
named without pinning down the specific mechanism (lookout's client-facing rate limiting,
chronicle's query rate limiting, invite-code `maxOutstanding`). Standard web-form abuse
protections (some CAPTCHA-equivalent) are a reasonable expectation for the public signup page
itself but are not designed here.

### Explicitly not resolved here

**Tenant deletion** remains unresolved — this ADR is scoped to creation. A tenant that reaches
`status: deleted` by whatever future mechanism, and whether its `slug` becomes reusable
afterward, is a separate open question.

## Consequences

- New tower route, new installation-level config section, new secret.
- Tower needs its own direct, portcullis-bypassing ingress.
- Provider `DELETE` gains the last-provider safeguard.
- `web` and `steward` both need a UI surface for this (ADR 0068).

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md), [ADR 0009](0009-tenant-data-via-syncbundle-no-github.md), [ADR 0011](0011-minimizing-towers-signet-footprint.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0022](0022-herald-communications-service.md), [ADR 0023](0023-pii-isolation-via-hashed-contact-records.md), [ADR 0027](0027-portcullis-computed-identity-hash.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0053](0053-lifecycle-status-consolidation.md)
