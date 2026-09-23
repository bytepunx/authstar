# Story 012 — Signet Precedence and JWKS URL

**Epic:** Config/Secrets Compliance
**Repo:** web
**Status:** Draft
**Per:** [ADR 0102](../../decisions/0102-signet-precedence-and-fallback-scope.md), closing the gap
separately tracked in [ADR 0086](../../decisions/0086-jwks-endpoint-for-internal-jwt-verification.md)
and [ADR 0091](../../decisions/0091-tenant-owned-domains-and-the-authstar-admin-surface.md).

---

## Summary

Web's config (`TOWER_BASE_URL`, `PUBLIC_TOWER_BASE_URL`, `KEEP_BASE_URL`, `INTERNAL_JWT_JWKS_URL`)
is plain env with no signet wiring, and was never brought into ADR 0004's scope despite web being
named there. The most consequential gap: `INTERNAL_JWT_JWKS_URL` sits permanently unset in the
live cluster (confirmed against `authstar-integration`'s manifests) — meaning internal-JWT
verification is not actually happening, a real auth-relevant gap, not just a docs issue. This
story both brings web's config under ADR 0102's precedence rule and closes that specific gap.

## Acceptance Criteria

- [ ] Add the minimal bootstrap surface, gating Signet-Configured Mode; absence preserves today's
      `.env.example`-documented behavior (Env-Only Mode).
- [ ] In Signet-Configured Mode, `towerBaseUrl`, `keepBaseUrl` are sourced from the bundle,
      overriding the env equivalents if both present.
- [ ] `INTERNAL_JWT_JWKS_URL`: set explicitly in `authstar-integration`'s web manifest (or sourced
      from the bundle in Signet-Configured Mode) — verify against the live cluster that this
      closes the currently-open "requests treated as unauthenticated" gap before merging. Treat
      this as the priority item in this story; the rest is precedence-model consistency.
- [ ] `PUBLIC_TOWER_BASE_URL` stays public (`$env/dynamic/public`) as today — correctly outside
      the signet/secret boundary since it's intentionally client-visible; no change to its
      public/private module placement.
- [ ] `KEEP_BASE_URL`, currently used in code but missing from `.env.example`, gets documented
      there regardless of which mode is active (Env-Only Mode still needs it listed).

## Not Covered Here

- Any change to how the operator/session bearer flow works — this story is scoped to config
  sourcing, not auth logic itself, beyond ensuring the JWKS URL is actually populated.
