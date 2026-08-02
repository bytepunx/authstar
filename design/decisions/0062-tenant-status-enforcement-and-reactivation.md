# ADR 0062: Tenant Status Enforcement, Suspension, and Reactivation

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, portcullis, steward
- **Resolves gaps found while designing:** [ADR 0063](0063-web-settings-screen.md)

## Context

`web`'s Settings needed a way to edit tenant-level fields, which surfaced two real gaps: no
route exists to write `tenant.name`/`cookie`/`status` at all, and `tenant.status` — despite
existing on the actor since ADR 0020 — was never actually enforced anywhere. Portcullis's
bundle never included it, and Story 013's decision flow never checked it. "Suspending a tenant"
today would be a pure no-op.

## Decision

### Portcullis enforces tenant status as the very first gate, before application resolution

`tenant.status` joins the fields already flowing into portcullis's bundle (Story 001). Story
013's decision flow gains a new first step: resolve the tenant from `Host`, check `status`
*before* resolving which application matched. A `suspended` tenant rejects every request to
**every** application under it — including `_admin` and `_portal` (ADR 0050) — with a clear,
generic error. This has to happen before application resolution specifically because it must
apply uniformly across all of a tenant's applications, not be re-implemented per application.

### `PATCH /tenants/{tenantSlug}` — new tower route, with a deliberately restricted status transition

`name` and `cookie` (`domain`/`path`/`maxAge`/`secure`) are freely editable. `status` accepts
**only** the `active → suspended` transition through this route — gated by a new `tenant:manage`
permission. `suspended → active` and any transition to `deleted` are **structurally unreachable**
through the tenant-scoped route tree at all, no matter how broad a permission a tenant admin
holds — not a matter of gating harder, but of the capability not existing on this route.

### Reactivation is operator-only, through `steward`

The direct consequence of the enforcement above: a tenant that suspended itself has no path back
through `_admin`, since `_admin` is itself unreachable once suspended. `steward`'s tenant search
(ADR 0048) gains a visible status column and a reactivate action
(`PATCH { status: "active" }`, called via `steward`'s own tower operator route, unaffected by
any single tenant's suspension since it never goes through portcullis at all).

### Tenant creation and deletion remain explicitly out of scope — unchanged from ADR 0021

This ADR resolves reactivation of an **already-existing**, merely-suspended tenant — consistent
with ADR 0021's own framing ("operates on tenants that already exist"). It does not resolve how
the very first tenant comes to exist, or how one is permanently removed — both remain the
open, deliberately-deferred questions ADR 0021 already named.

### `httpOnly` is not exposed as an editable field, anywhere

There's no legitimate reason an authstar-issued session cookie should ever be readable by JS —
this stays fixed at `true`, not a configuration choice at all, not even for the operator.

## Consequences

- Story 001 (portcullis bundle) and Story 013 (auth gate) both need updating.
- New tower route (`PATCH /tenants/{tenantSlug}`) and permission (`tenant:manage`).
- `steward`'s tenant search screen gains a status indicator and reactivate action.

## Related

- [ADR 0020](0020-tenant-application-actors-and-secret-handling.md), [ADR 0021](0021-cli-operator-bootstrap.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0044](0044-web-surfaces-and-distribution-model.md), [ADR 0048](0048-steward-ux.md), [ADR 0050](0050-portal-reserved-application.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md)
