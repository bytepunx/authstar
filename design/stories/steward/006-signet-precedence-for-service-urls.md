# Story 006 — Signet Precedence for Service URLs

**Epic:** Config/Secrets Compliance
**Repo:** steward
**Status:** Draft
**Per:** [ADR 0102](../../decisions/0102-signet-precedence-and-fallback-scope.md)

---

## Summary

Steward holds no real secrets in env by design — the operator bearer token is deliberately kept
out of env entirely and modeled as a per-request header (`src/lib/server/request-auth.ts`),
which is correct and unaffected by this story. Its two settings, `TOWER_URL` and `HERALD_URL`
(`src/lib/server/env.ts`), are plain internal-service URLs never brought into signet's scope by
any ADR. This story adds the same Env-Only/Signet-Configured split ADR 0102 defines, applied to
plain config rather than secrets.

## Acceptance Criteria

- [ ] Add the minimal bootstrap surface, gating Signet-Configured Mode the same way as other
      services; absence preserves today's `env.ts` behavior unchanged (Env-Only Mode).
- [ ] In Signet-Configured Mode, `towerUrl` and `heraldUrl` are sourced from the bundle, overriding
      `TOWER_URL`/`HERALD_URL` if both are present.
- [ ] `HERALD_URL` is currently declared in `env.ts` but never actually consumed anywhere
      (`heraldClient` is never invoked — rotate-keys routes through tower). Either wire it to its
      intended use or remove it as dead config — do not carry a signet-sourced field for a value
      nothing reads.
- [ ] `PORT`/`HOST` (adapter-node's own vars, not currently part of `StewardEnv`) are out of scope
      for signet — infra-level, not tenant/operator config, per ADR 0102's product-default carve-out.

## Not Covered Here

- The operator bearer token — already correctly excluded from env/signet by design (per-request
  header only), no change.
