---
id: ADR-0045
title: "`steward` — a Separate Operator Console, Distinct from Tenant Admin"
status: accepted
date: 2026-07-30
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0045: `steward` — a Separate Operator Console, Distinct from Tenant Admin

- **Status:** Accepted (keep-specific correction below reversed by [ADR 0046](0046-tenant-owned-stripe-configuration.md))
- **Date:** 2026-07-30
- **Affects:** steward (new service), tower, keep
- **Resolves the open item in:** [ADR 0044](0044-web-surfaces-and-distribution-model.md)

> **Note (2026-07-30):** the "Correction: `keep`'s plan-mapping writes are operator-only"
> section below was correct only under ADR 0042's now-superseded single-account billing model.
> [ADR 0046](0046-tenant-owned-stripe-configuration.md) restores tenant-owned Stripe accounts,
> which means plan mappings are tenant-managed again — `steward` has no keep-specific role at
> all now. Everything else in this ADR (why `steward` exists, its relationship to **tower**, the
> shared operator-token, direct port-forward posture) is entirely unaffected.

## Context

Tenant admin and installation-operator admin are genuinely different trust boundaries, not just
different permission levels — the two populations can be entirely disjoint (a multi-tenant SaaS
install: bytepunx's own team vs. each customer's own admins) or the same people wearing two
hats (a self-hosted single-tenant install), but the *mechanism* shouldn't conflate them either
way. Cross-tenant operator access has no tenant whose OIDC providers could authenticate it, and
must work even before any tenant exists (the bootstrap case ADR 0021 already covers for the
CLI).

## Decision

`steward` — a new, separate service, not a mode within `web`.

### `steward` — a new, separate service, not a mode within `web`

Continuing the castle theme: a steward manages the whole estate on the owner's behalf, distinct
from `herald` (messenger), `lookout` (watcher), `chronicle` (record-keeper). This follows the
same instinct behind every other service split in this design (lookout/chronicle over
reliability tier, herald's two signing keys kept separate) — different trust boundary, different
network exposure, different service.

### Never reached through portcullis — direct port-forward, mirroring ADR 0021 exactly

`steward` has no public ingress. It's reached via `kubectl port-forward`, the same posture
already established for tower's operator API and, before that, signet's own `AdminService` —
deliberate extra friction for a highly privileged, rarely-used surface is a feature, not a
UX gap to fix.

### One shared operator-token, not one per backend service

ADR 0021's bearer-token pattern has each service (tower, keep) independently validate a token
against its own copy of a signet-managed secret. Making a human operator juggle a different
token per backend they need to reach through `steward` would be a bad experience for no real
security benefit. Instead: **one operator-token value**, distributed via signet identically to
tower's, keep's, and `steward`'s own bundles. The operator authenticates to `steward` once;
`steward` forwards that same token as `Authorization: Bearer` when calling tower's and keep's
operator route trees on the operator's behalf — each backend still independently validates it
against its own copy, unchanged from ADR 0021's actual security model, just no longer requiring
the operator to hold multiple credentials.

> **Extended 2026-08-02 ([ADR 0081](0081-herald-key-rotation.md)):** herald joins this same
> distribution, gaining its first (and, so far, only) operator-bearer-token route — the pattern
> established here generalized to a fourth backend exactly as designed.

### Correction: `keep`'s plan-mapping writes are operator-only, not tenant-admin-accessible

Surfaced while designing this: ADR 0042 already established that plans are operator-defined
(only the operator holds the Stripe account the Prices live on), but ADR 0041's route inventory
left `POST`/`PATCH`/`DELETE` on `/tenants/{tenantSlug}/plan-mappings` reachable by a tenant
admin's own `permissions`. That would let a tenant admin grant themselves arbitrary
`grantedRoles`/`seatLimit` against a Price they don't control — a real privilege gap, not a
theoretical one. **Fix:** `GET` on plan-mappings remains tenant-scoped (a tenant admin can see
what plans exist and what they grant); `POST`/`PATCH`/`DELETE` move to keep's **operator** route
tree only, called via `steward`.

## Consequences

- New repo eventually needed (`authstar-steward`), not created yet.
- `claude.md`'s service list needs updating.
- ADR 0041's plan-mappings route group needs its auth-tier annotation corrected (`GET`
  tenant-scoped, writes operator-only) — not rewritten in full here, flagged for that ADR's next
  touch.
- `steward`'s own screens/functionality — designed in [ADR 0048](0048-steward-ux.md): tower's
  operator API only (the keep-facing role above is itself reversed by ADR 0046) — admin access
  and OIDC provider management for existing tenants.

## Related

- [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0046](0046-tenant-owned-stripe-configuration.md), [ADR 0048](0048-steward-ux.md)
