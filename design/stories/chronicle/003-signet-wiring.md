# Story 003 — Signet Wiring

**Epic:** Config/Secrets Compliance
**Repo:** chronicle
**Status:** Draft
**Per:** [ADR 0102](../../decisions/0102-signet-precedence-and-fallback-scope.md), reaffirming
[ADR 0036](../../decisions/0036-chronicle-reporting-api-and-retention-config.md)'s original
(unimplemented) scoping.

---

## Summary

ADR 0036 already decided chronicle gets its own signet bundle "no exceptions." Chronicle has
never implemented this — all thirteen of its settings (`src/lib/config.ts`, `src/server.ts`) are
plain `process.env` reads with no signet dial at all, including `CHRONICLE_INTERNAL_JWT_SECRET`
defaulting to the literal `'dev-only-insecure-secret'`, which the cluster manifest currently sets
verbatim. This story implements the signet dial keep/herald/tower already use and brings
chronicle's secrets under it, while preserving Env-Only Mode for local dev per ADR 0102.

## Acceptance Criteria

- [ ] Add the standard bootstrap surface (`SIGNET_NAMESPACE`, `SIGNET_SERVICE` default
      `'chronicle'`, `SIGNET_ADDR`, `SIGNET_TRUST_DOMAIN`, `SIGNET_ADMIN_ADDR`), following the
      `dialWorkload`/`getServiceBundle` pattern from `keep`/`herald`/`tower`'s `src/server.ts`.
      Presence of `SIGNET_ADDR` gates Signet-Configured Mode; its absence keeps chronicle in
      today's Env-Only Mode unchanged.
- [ ] In Signet-Configured Mode, source from the bundle/secrets (fail loud if missing, per ADR
      0102 — no silent default):
  - [ ] `CHRONICLE_CLICKHOUSE_PASSWORD` → `secrets.clickhousePassword`
  - [ ] `CHRONICLE_RABBITMQ_URL` → `bundle.rabbitmqUrl` / `secrets.rabbitmqUrl`
  - [ ] `CHRONICLE_INTERNAL_JWT_SECRET` → `secrets.internalJwtSecret` — remove the
        `'dev-only-insecure-secret'` literal from the Signet-Configured Mode path entirely; it may
        remain as an Env-Only Mode-only default, clearly logged as dev-only.
- [ ] Plain config (`CHRONICLE_CLICKHOUSE_URL`, `_USERNAME`, `_DATABASE`, `CHRONICLE_RETENTION_MONTHS`,
      `CHRONICLE_MAX_DATE_RANGE_DAYS`, `CHRONICLE_QUERY_TIMEOUT_MS`, `CHRONICLE_RATE_LIMIT_MAX`,
      `CHRONICLE_RATE_LIMIT_WINDOW_MS`) moves to `bundle.*`, matching ADR 0036's original list,
      with the same fail-loud-when-configured-but-missing rule for anything the bundle should
      have provisioned.
- [ ] `authstar-integration`'s `config/authstar/chronicle.yaml` and `secrets/authstar/chronicle/`
      are populated to match (currently the values live only as hardcoded plaintext directly in
      `manifests/1X-chronicle.yaml`, which this story removes in favor of the signet-sourced path).
- [ ] Resolve or explicitly re-flag the HS256 (chronicle) vs. ES256 (tower) internal-JWT algorithm
      mismatch noted in the original audit — out of scope to fix the algorithm itself here, but the
      new signet-sourced secret must not paper over the mismatch; call it out in the PR description
      if not resolved.

## Not Covered Here

- The internal-JWT algorithm mismatch's actual resolution (HS256 vs ES256) — flagged, not fixed,
  unless trivial once the secret is signet-sourced.
