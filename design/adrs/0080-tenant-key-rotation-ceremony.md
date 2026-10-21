---
id: ADR-0080
title: Tenant Key Rotation Ceremony
status: accepted
date: 2026-08-02
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0080: Tenant Key Rotation Ceremony

- **Status:** Accepted
- **Date:** 2026-08-02
- **Affects:** tower, steward, portcullis
- **Resolves the open item in:** [ADR 0002](0002-multi-tenant-architecture-and-key-management.md)

> **Corrected 2026-08-12:** the claim below that session/internal JWT verification "already
> support a `kid`-selected current key plus one still-valid prior key within a rotation overlap
> window" is **wrong** — checked against the actual code, exactly one key is ever held per
> tenant per key purpose, and no secret-naming convention exists for a second one. Tower's
> `POST /operator/tenants/{tenantSlug}/rotate-keys` was also never implemented for the
> session/internal cases (`steward` calls a route with nothing on the other end). See
> [ADR 0088](0088-session-internal-key-rotation-overlap.md), which supersedes this ADR's
> session/internal-key handling and actually specifies the mechanism. This ADR's
> identity-hash-key handling and its general route shape remain accurate.

## Context

ADR 0002 left "the key-generation ceremony at tenant onboarding/rotation" as an open research
item. Onboarding was resolved by [ADR 0067](0067-tenant-creation-and-provisioning.md) (initial
generation of all four per-tenant secrets at creation). Rotation was not — and checking closely,
it's genuinely missing for all three of a tenant's rotatable keys, not just the ones ADR 0002
named. The **verification** side is fully built and has been for a while: session and internal
JWT verification already support a `kid`-selected current key plus one still-valid prior key
within a rotation overlap window (Story 008/009), and identity-hash-key already supports
multiple named generations with a retention window (ADR 0028). What's missing in every case is
the **producer** — nothing anywhere generates a new key/generation after initial tenant
creation. [ADR 0054](0054-web-billing-and-communications-screens.md) already named this
directly: "rotation, if ever needed, is an operator/infrastructure concern," without designing
what that concern actually looks like.

Two other ADR 0002 items turn out to already be resolved, just never cross-referenced:
**encryption at rest** and **valkey cache access control** were both superseded by
[ADR 0004](0004-signet-for-configuration-and-secrets.md) — signet's own SOPS/age-encrypted,
SPIFFE-mTLS-delivered storage replaced tower's own durable store entirely, and the valkey
read-through tier ADR 0002 worried about access-controlling was retired outright ("no
cache-population code to write and operate in tower"). Neither needs new design — just the
pointer this ADR adds.

## Decision

`POST /operator/tenants/{tenantSlug}/rotate-keys` — operator-only, one route for all three key types.

### `POST /operator/tenants/{tenantSlug}/rotate-keys` — operator-only, one route for all three key types

Consistent with ADR 0054's own framing: this is an operator/infrastructure action, not a tenant-
admin one — no tenant-scoped route, no `permissions` grant, reached only through `steward`'s
existing bearer-token model (ADR 0021/0045), the same posture as ADR 0062's tenant reactivation.

Body: `{ keys: ('session' | 'internal' | 'identity-hash')[] }` — an operator can rotate one, two,
or all three in a single call; each is handled independently.

### What it does — reuses each key's own already-established generation/overlap shape, produces what was missing

- **`session`/`internal`**: generates a new ES256 keypair, assigns it the next `kid`, pushes it
  to portcullis's bundle (via tower's existing elevated `SyncBundle` access, ADR 0011/0067)
  alongside the previous key — both remain valid for verification (Story 008/009's existing
  overlap-window logic), only the new one is used for signing going forward.
- **`identity-hash`**: generates the next-numbered generation, sets its `effectiveFrom` to now,
  pushes it alongside every other generation still within ADR 0028's retention window (at least
  the tenant's cookie `maxAge`) — the exact shape ADR 0028 already defined, just triggered by an
  actual caller for the first time.

### Pruning happens at rotation time, not a separate scheduled job

When rotating, tower drops any generation/prior key from the outgoing bundle push once it's
past its own retention window (already-defined per key type above) — reusing ADR 0028's own
stated intent ("can be safely garbage-collected") without needing a new standing job. A tenant
that never rotates never prunes, which is fine: nothing accumulates until rotation actually
happens.

### `steward` gains a Rotate Keys action, heavy-confirmation

A new small section in `steward`'s tenant operator context (ADR 0048) — operator selects which
key(s) to rotate, confirms explicitly. Given the consequence profile (a session-key rotation
means every *un*-refreshed browser session eventually needs a fresh login once its cookie
outlives the overlap window), this gets the same heavy-confirmation treatment ADR 0063 already
established for similarly consequential tenant-level actions, not a casual one-click toggle.

### Cross-tenant operator routes never touch a tenant's signing key at all — confirming, not designing

Checked directly: every existing operator-scoped route (ADR 0021's admin/provider management,
ADR 0048's tenant search/activity) acts on tower's own event-sourced state and signet secret
writes, never on portcullis's dynamic key-resolution path. This ADR's own new route is the
**first** operator action that touches tenant key material at all — and it does so through the
same signet push mechanism every other secret-writing action already uses, not a new one. ADR
0002's item (d) is closed as "not applicable" rather than needing its own design: cross-tenant
admin operations were never on the tenant key-resolution path to begin with.

## Consequences

- New tower operator route, reusing existing `SyncBundle` push mechanics (no new secret-delivery
  mechanism).
- `steward` gains one new action.
- ADR 0002's three open items are now all closed: encryption-at-rest and valkey access control
  by pointer to ADR 0004 (already resolved, undocumented until now); the rotation ceremony by
  this ADR.

## Related

- [ADR 0002](0002-multi-tenant-architecture-and-key-management.md), [ADR 0004](0004-signet-for-configuration-and-secrets.md), [ADR 0011](0011-minimizing-towers-signet-footprint.md), [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0028](0028-identity-hash-key-generations.md), [ADR 0045](0045-steward-operator-console.md), [ADR 0048](0048-steward-ux.md), [ADR 0054](0054-web-billing-and-communications-screens.md), [ADR 0062](0062-tenant-status-enforcement-and-reactivation.md), [ADR 0063](0063-web-settings-screen.md), [ADR 0067](0067-tenant-creation-and-provisioning.md)
