# ADR 0063: `web`'s Settings Screen

- **Status:** Accepted
- **Date:** 2026-08-01
- **Affects:** web
- **Extends:** [ADR 0049](0049-web-admin-information-architecture.md)
- **Depends on:** [ADR 0062](0062-tenant-status-enforcement-and-reactivation.md)

## Decision

### Fields, by risk level

- **Name** — freely editable, no special handling.
- **Cookie `maxAge`** — low-risk: changing it only affects sessions issued *after* the change;
  existing sessions keep whatever value was baked in at issuance. No warning needed beyond
  documenting that behavior.
- **Cookie `domain`** — a prominent warning, not a hard block: changing it invalidates every
  currently-active session using the old domain (a real, understand-before-you-act consequence,
  the same weight as changing DNS), but a tenant genuinely migrating domains needs to be able to
  do it.
- **Cookie `secure`** — editable, with a clear "development/staging only" warning if set to
  `false` — never silently allowed without the admin understanding what they're turning off.
- **Cookie `httpOnly`** — not shown as an editable field at all (ADR 0062 — fixed, not a choice).
- **Tenant status** — read-only display of current status, plus a **"Suspend This Tenant"**
  action requiring heavy confirmation (the same "type something back to confirm" weight as
  contact erasure, ADR 0055), explicitly warning that this locks out **every** application under
  the tenant, including `_admin` itself, and that undoing it requires contacting an operator —
  there is no self-service path back, by design (ADR 0062).

### Explicitly not duplicated here

- **Providers** — live in Identity & Access (ADR 0051), not repeated in Settings.
- **`seatLimit`** — billing-derived (materialized from `keep`'s entitlement events, ADR 0031),
  shown in Billing alongside the active plan it comes from, not editable here at all.
- **Secrets** (`contact-hash-pepper`, `identity-hash-key` generations, tenant signing keys) —
  never exposed for editing in any `web` screen, consistent with the same rule already stated
  for herald's own keys (ADR 0054).

## Consequences

- No new backend mechanism beyond ADR 0062 — straightforward consumer of it.
- This completes `web`'s admin information architecture (ADR 0049) — all eight sections now
  have a concrete design.

## Related

- [ADR 0049](0049-web-admin-information-architecture.md), [ADR 0054](0054-web-billing-and-communications-screens.md), [ADR 0055](0055-web-privacy-compliance-screens.md), [ADR 0062](0062-tenant-status-enforcement-and-reactivation.md)
