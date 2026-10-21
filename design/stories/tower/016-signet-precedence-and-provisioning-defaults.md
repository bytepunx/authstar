---
title: "Story 016: Signet Precedence and Provisioning Defaults"
updated: 2026-09-03
status: draft
---
# Story 016 — Signet Precedence and Provisioning Defaults

**Epic:** Config/Secrets Compliance
**Repo:** tower
**Status:** Draft
**Per:** [ADR 0102](../../adrs/0102-signet-precedence-and-fallback-scope.md)

---

## Summary

Tower already dials signet correctly for `dbConnectionString`, `rabbitmqUrl`, `contactHashPepper`,
and `heraldPayloadPublicKey` (fail-loud, or a documented safe-degrade for the public key — no
changes needed there). The entire `provisioning.*` block and `SIGNET_ADMIN_TOKEN` don't yet follow
ADR 0102's precedence/fail-loud rule — this is the largest single compliance gap found in the
2026-08-31 audit.

## Acceptance Criteria

- [ ] `SIGNET_ADMIN_TOKEN` (`src/server.ts:118`): same fix as herald/keep — fail loud on a missing
      `secrets.signetAdminToken` in Signet-Configured Mode, no env fallback in that mode.
- [ ] `provisioning.selfServiceEnabled` (`src/server.ts:125`): remove the `?? false` hardcoded
      literal. Missing from the bundle in Signet-Configured Mode = startup error, not "feature
      off by default."
- [ ] `provisioning.operatorToken` (`src/server.ts:126`): remove the `?? ''` hardcoded literal;
      same fail-loud treatment as herald's `operatorToken`.
- [ ] `provisioning.defaultProvider` (`src/server.ts:127-129`): remove the hardcoded
      `{name: '', clientId: '', discoveryUrl: '', scope: []}` fallback object. Missing from the
      bundle = startup error naming which sub-field(s) are absent, not a silently-broken default
      provider config.
- [ ] `provisioning.defaultProviderClientSecret` (`src/server.ts:130`, keyed
      `default-provider-client-secret`): remove the `?? ''` hardcoded literal; fail loud if missing.
- [ ] All five above remain optional/env-configurable **only** in Env-Only Mode (bootstrap
      coordinates absent) — this story does not remove Env-Only Mode itself, only the silent
      degrade that currently happens when signet **is** configured but incomplete.

## Not Covered Here

- `dbConnectionString`, `rabbitmqUrl`, `contactHashPepper` — already compliant, no changes.
- `heraldPayloadPublicKey`'s ephemeral-keypair safe-degrade (`src/server.ts:65-78`) — already
  logs loudly and is documented (ADR 0025/0081), compliant as-is.
- The tower↔portcullis key-format mismatch (opaque bytes vs. required PEM EC P-256) flagged in
  the original audit — separate bug, not a signet-sourcing issue, tracked independently.
