# Story 008 — Signet Precedence and Credential Salt

**Epic:** Config/Secrets Compliance
**Repo:** keep
**Status:** Draft
**Per:** [ADR 0102](../../decisions/0102-signet-precedence-and-fallback-scope.md)

---

## Summary

Keep already dials signet correctly for `dbConnectionString`, `rabbitmqUrl`, and `towerBaseUrl`
(fail-loud if the bundle omits them — no changes needed there). Two settings don't yet follow
ADR 0102's precedence/fail-loud rule and need fixing.

## Acceptance Criteria

- [ ] `SIGNET_ADMIN_TOKEN` (`src/server.ts:99`, `src/sync-pricing.ts:73`): in Signet-Configured
      Mode, `secrets.signetAdminToken` missing from the bundle must throw a startup error naming
      the missing secret and that it needs provisioning in signet — no `requireEnv('SIGNET_ADMIN_TOKEN')`
      fallback in this mode. The env fallback remains valid only in Env-Only Mode (bootstrap vars
      absent entirely).
- [ ] `KEEP_CREDENTIAL_SALT` (`src/lib/hash.ts:10`): move into the signet bundle/secrets as
      `credentialSalt` (or equivalent), sourced the same way as keep's other secrets. Remove the
      hardcoded `'keep-dev-salt'` literal from the Signet-Configured Mode path — it may remain as
      an Env-Only Mode default only, clearly logged as a dev-only value if used. Remove the
      ADR 0079 citation from the code comment; that ADR concerns the credential's own secret
      material leaving the trust boundary, not the salt used to hash it, which never leaves keep.
- [ ] Both changes fail startup loudly (clear error identifying the field and where to provision
      it) rather than continuing with a default, whenever keep is in Signet-Configured Mode.
- [ ] `config/authstar/keep.yaml` and `secrets/authstar/keep/` in `authstar-integration` gain the
      new `credentialSalt` secret scope; the manifest's env-var equivalent (if any) is removed to
      avoid the duplicate-source-of-truth pattern flagged in the original audit.

## Not Covered Here

- `dbConnectionString`, `rabbitmqUrl`, `towerBaseUrl` — already compliant, no changes.
- Per-credential random salting (flagged as a separate follow-up in the existing `hash.ts`
  comment, orthogonal to signet-sourcing).
