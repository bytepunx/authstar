# ADR 0003: Enrichment Outcome Response Contract

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** portcullis

## Context

ADR 0001 defined the three-way `Allow / Deny / Unreachable` enrichment outcome but left two
things unresolved: whether `Deny`'s `reason` is ever visible to the client, and what exactly a
fail-open `Unreachable` response looks like to the upstream application. This ADR settles both.

## Decision

### `Deny.reason` is never exposed to the client

Consistent with the existing pattern in Story 006 (raw provider errors logged, not returned),
a `Deny` outcome always produces a generic client-facing response (e.g.
`{"error": "Forbidden"}`) with the appropriate status code. The `reason` is logged server-side
at a detail level sufficient for troubleshooting misconfiguration and errors.

Tenant-scoped visibility into that logging — so an application administrator can review why
their users are being denied — is a real need but is explicitly **deferred**. It is an
observability/audit-log feature for tower/web, not a portcullis concern, and is not designed
here.

### `Unreachable` (fail-open) forwards explicit, minimal claims — never silence

When tower is unreachable and the tenant's policy is fail-open (ADR 0001), the request
proceeds, but the internal token must let the upstream application distinguish "tower is
unreachable" from "this user genuinely has no roles/entitlements" — otherwise the application
cannot make an informed decision (e.g. showing a "temporary authentication issue" page instead
of silently degrading access).

The internal token gains an explicit claim:

```
enrichment_status: "ok" | "degraded"
```

When `"degraded"`, the token carries only the identity claims already known from the session
JWT (`sub`, `idp`, `idp_sub`) — no role, status, or entitlement claims are fabricated or
assumed. Applications must treat the absence of those claims under `degraded` as "unknown,"
not "denied" or "granted," and are expected to handle that state explicitly (e.g. a
maintenance/degraded-auth page) rather than inferring it from missing optional claims.

## Consequences

- **Story 010** (internal JWT generation): add `enrichment_status` to the internal token's
  claim set, sourced from the `EnrichOutcome` the gate received.
- **Story 013** (auth gate): `Deny` responses use a generic body; `reason` is logged, not
  returned.
- Documentation for adopting applications must describe the `enrichment_status` contract
  explicitly, since correct handling requires applications to branch on it rather than treat
  missing claims as authoritative.

## Related

- Extends [ADR 0001](0001-claims-enrichment-via-tower.md)
