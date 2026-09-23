# ADR 0053: Lifecycle State Transitions via `PATCH`, Not a Separate `DELETE` — Consolidated Fix

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** tower, keep, herald

## Context

The account-status design fixed early in this project established that lifecycle transitions
belong on `PATCH`-a-field, not verb-flavored action endpoints — later applied to `application`
(ADR 0051: `DELETE` was a redundant alternate path to a state `PATCH` already reached). A
systematic pass over **every** `DELETE`-capable resource across tower, keep, and herald, while
designing Billing and Communications, found the same pattern violated in eight places — most
are cosmetic (a real status field already exists; `DELETE` just bypasses `PATCH` to reach it),
but two are genuine correctness bugs: hard-removing a `planMapping` or `provider` that existing
subscribers/applications still reference breaks their behavior going forward, not just their
audit history.

## Decision

| Resource | Service | Current state | Fix |
|---|---|---|---|
| `trial` | keep | Has `status`; `DELETE` bypasses it | `DELETE` becomes an alias for `PATCH {status: "expired"}` — revoke is immediate expiration, no new state value needed |
| `coupon` | keep | Has `status`; no `PATCH` at all | Add `PATCH`; `DELETE` becomes an alias for `PATCH {status: "revoked"}` |
| `invite` | tower | Has `status`; no `PATCH` at all | Same fix — alias for `PATCH {status: "revoked"}` |
| `inviteCode` | tower | Has `status`; no `PATCH` at all | Same fix — alias for `PATCH {status: "revoked"}` |
| `roleDefinition` | tower | Has `status`; `DELETE` already described as "retires" in prose | Made explicit and consistent: alias for `PATCH {status: "retired"}`, not a separate mechanism |
| `communicationType` | herald | **No `status` field at all** | New finding: add `status: "active" \| "deprecated"`. Without it, deleting a type referenced by historical `communication` records (ADR 0025) orphans their meaning — the same historical-reference reasoning already applied to template versioning and `roleDefinition` retirement |
| `planMapping` | keep | **No `status` field**; `DELETE` currently a real removal | **Correctness bug, not just cosmetic**: an existing subscriber's renewal webhook looks up `planMapping` by `stripePriceId` (ADR 0038) — hard-deleting a grandfathered plan silently breaks entitlement updates for everyone still on it. Add `status: "active" \| "retired"`. Keep's webhook lookup must still find and honor a **retired** mapping for existing subscribers; only the admin create/upgrade flow filters to `active` |
| `provider` | tower | **No `status` field**; `DELETE` currently a real removal | Same class of bug: an `application.exposedProviders` entry referencing a removed provider silently breaks that application's login page. Add `status: "active" \| "removed"`. Because tower owns **both** `provider` and `application`, it can (and should) synchronously check whether any active application still exposes a provider before allowing removal — a real validation, not just eventual-consistency guidance, since both sides live in one service |

### Confirmed *not* part of this pattern

- **`contact` (tower)** — `DELETE` is the GDPR erasure trigger (ADR 0023/0026). Genuinely
  destructive by design; this is the one place a real, hard delete is the correct behavior.
- **`opt-out` category (herald)** — removing one category from a collection is a membership
  operation, not an entity's own lifecycle status; `DELETE` is the correct verb.
- **`subscription`, `customer`, `usageRecord` (keep)**, **`template`, `communication` (herald)**
  — no `DELETE` exists on any of these; already correctly designed (webhook-driven, immutable-
  versioned, or retry-via-`PATCH` respectively).

## Consequences

- ADR 0018 (`invite`), 0019 (`inviteCode`), 0025/0034 (`communicationType`), 0038/0039/0041
  (`planMapping`, `trial`, `coupon` routes), 0047 (`roleDefinition`), and 0016/0030 (`provider`)
  all get pointer-note corrections.
- `web`'s screens for every affected resource use `PATCH` for revoke/deprecate/retire actions —
  consistent with `account`/`tenant`/`application`.
- Tower gains a synchronous cross-check (provider removal vs. active `application.exposedProviders`
  references) — the one case in this whole design where cross-entity validation can be immediate
  rather than eventually-consistent, because both sides are owned by the same service.

## Related

- [ADR 0016](0016-application-layer-and-sso-scope.md), [ADR 0018](0018-trial-roles-and-keep-boundary.md), [ADR 0019](0019-invite-codes.md), [ADR 0025](0025-versioned-templates-and-encrypted-payloads.md), [ADR 0030](0030-tower-api-surface.md), [ADR 0034](0034-herald-api-surface.md), [ADR 0038](0038-plan-mapping-and-subscription-tracking.md), [ADR 0039](0039-keep-trials-and-coupons.md), [ADR 0041](0041-keep-api-surface.md), [ADR 0047](0047-application-and-role-slug-validation.md), [ADR 0051](0051-web-applications-and-identity-access-screens.md) (the `application` fix this generalizes)
