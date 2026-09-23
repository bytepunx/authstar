# Story 011 — Tenant Management and Key Rotation

**Epic:** Tenant Lifecycle
**Repo:** tower
**Status:** Draft
**New — tower's side of the routes [ADR 0062](../../decisions/0062-tenant-status-enforcement-and-reactivation.md)/
[ADR 0080](../../decisions/0080-tenant-key-rotation-ceremony.md) already specify.**
Per [ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md),
[ADR 0028](../../decisions/0028-identity-hash-key-generations.md),
[ADR 0062](../../decisions/0062-tenant-status-enforcement-and-reactivation.md),
[ADR 0080](../../decisions/0080-tenant-key-rotation-ceremony.md).
**Depends on:** [Story 001](001-actor-definitions.md)'s `tenant` shape and its async
`SyncBundle`-push mechanism, reused unchanged by every route below.

---

## Tenant Settings

### `GET /tenants/{tenantSlug}` — non-secret fields only

- [ ] Returns `tenant`'s own core fields — `slug`, `name`, `status`, `cookie` (non-secret parts:
      `domain`/`path`/`maxAge`/`secure`; `httpOnly` included but never as an editable-looking
      field), `seatLimit`, `branding`, `createdAt`. **Does not** include the full `applications`/
      `providers` arrays — those are Story 004's dedicated list routes; this detail view isn't
      where a caller goes to enumerate them, even though the same underlying `tenant` fetch
      technically has them available.

### `PATCH /tenants/{tenantSlug}` — tenant-scoped, restricted status transition

- [ ] Gated by `tenant:manage`. `name`/`cookie` (except `httpOnly`, never accepted, ever, by
      anyone, ADR 0062) are freely editable.
- [ ] `status` accepts **only** the `active → suspended` transition through this route.
      `suspended → active` and any transition to `deleted` are **structurally unreachable** here
      — not a permission check that could be granted broader, the transition genuinely doesn't
      exist on this route's command handler at all (ADR 0062).
- [ ] Triggers the async `SyncBundle` re-push (Story 001) — a `status: "suspended"` write is
      exactly what portcullis's own enforcement (Story 013's gate, ADR 0062) depends on actually
      reaching it.

### `PATCH /operator/tenants/{tenantSlug}` — operator-scoped, broader transition

- [ ] Bearer-token operator auth (ADR 0021). **Same command handler as the tenant-scoped route
      above**, per ADR 0030's "operator tree reuses the same handlers, different auth
      middleware" pattern — but the status-transition restriction is **not** identical between
      the two: this path additionally allows `suspended → active`. This is the *only* path back
      for a tenant that suspended itself, since suspension locks that tenant out of its own
      `_admin` — the surface that would otherwise handle it (ADR 0062).
- [ ] `active → suspended` also works here (an operator can suspend directly, not just reactivate)
      — the same transition the tenant-scoped route allows, just also reachable operator-side.
- [ ] Any transition to `deleted` remains unreachable through **either** route — tenant deletion
      stays entirely out of scope (ADR 0021), not something this story resolves.

---

## Key Rotation

### `POST /operator/tenants/{tenantSlug}/rotate-keys`

- [ ] Bearer-token operator auth, cross-tenant route tree — no tenant-scoped equivalent exists
      or should exist (ADR 0080's own framing: this is an operator/infrastructure concern, not a
      tenant-admin action, even though it acts on one tenant's keys).
- [ ] Body: `{ keys: ('session' | 'internal' | 'identity-hash')[] }` — one, two, or all three,
      handled independently within a single call.
- [ ] **`session`/`internal`**: generate a new ES256 keypair, assign it the next `kid`, push it
      to portcullis's bundle **alongside** the previous key (both valid for verification during
      the overlap window, Story 008/009's existing `kid`-selection logic on the portcullis side
      — nothing there needs to change, it already supports this). Only the new key signs going
      forward.
- [ ] **`identity-hash`**: generate the next-numbered generation, `effectiveFrom: now`, push
      alongside every generation still within its own retention window (`>=` the tenant's
      `cookie.maxAge`, ADR 0028) — Story 003's login-time reconciliation already knows how to
      walk multiple generations; this route is purely the missing *producer* ADR 0028 never had.
- [ ] **Pruning happens at rotation time, not a separate job**: when building the outgoing
      signet push, drop any generation/prior key already past its own retention window — a
      tenant that never rotates never accumulates anything to prune, so there's nothing to miss
      by not running a standing sweep.
- [ ] Triggers the same async `SyncBundle` mechanism (Story 001) implicitly, since the rotated
      material goes straight to signet — no `tenant` actor state changes as a result of this
      route at all (Story 001: rotation "goes straight to signet, never through this actor's own
      state").

---

## Not Covered Here

- Tenant *creation* — a genuinely separate concern (pre-tenant, its own direct ingress, ADR
  0067), its own future story.
- Tenant *deletion* — remains explicitly out of scope across this entire design (ADR 0021),
  not resolved by this story or any other yet.
- `steward`'s own UI for either of these actions — `steward`'s own future work, not tower's.
