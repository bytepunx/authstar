---
title: "Story 007: Signet Precedence and Operator Token"
updated: 2026-09-03
status: draft
---
# Story 007 — Signet Precedence and Operator Token

**Epic:** Config/Secrets Compliance
**Repo:** herald
**Status:** Draft
**Per:** [ADR 0102](../../adrs/0102-signet-precedence-and-fallback-scope.md)

---

## Summary

Herald already dials signet correctly for `dbConnectionString`, `rabbitmqUrl`, and `towerBaseUrl`
(fail-loud if missing — no changes needed). Two settings don't yet follow ADR 0102's
precedence/fail-loud rule. Herald is also formally added to ADR 0004's affected-services list by
ADR 0102 — no code change for that, just closing a documentation gap.

## Acceptance Criteria

- [ ] `SIGNET_ADMIN_TOKEN` (`src/server.ts:144`): in Signet-Configured Mode, `secrets.signetAdminToken`
      missing from the bundle must throw a startup error naming the missing secret — no
      `requireEnv('SIGNET_ADMIN_TOKEN')` fallback in this mode. Env fallback remains valid only in
      Env-Only Mode.
- [ ] `operatorToken` (`src/server.ts:145`): remove the hardcoded `?? ''` literal. In
      Signet-Configured Mode, a missing `secrets.operatorToken` must throw a startup error, not
      silently continue with an empty token (downstream code may currently treat `''` as "no
      operator auth required" — that failure mode is exactly what this closes).
- [ ] `payloadKeyGenerations` / `unsubscribeKeyGenerations` (`src/server.ts:67-97`): the existing
      ephemeral-keypair-generation fallback (used when signet lacks the field) is retained as-is
      — it already degrades safely and loudly (logged warning), which is compliant with this
      story's intent even though it predates ADR 0102. No change required, but confirm the warning
      log is unambiguous about which field is missing and that it needs a `rotate-keys` run.

## Not Covered Here

- `dbConnectionString`, `rabbitmqUrl`, `towerBaseUrl` — already compliant, no changes.
- Formal addition of herald to ADR 0004's "Affects" line — already done by ADR 0102 itself, no
  further action needed here.
