---
title: "Story 002: Signet Wiring"
updated: 2026-09-03
status: draft
---
# Story 002 — Signet Wiring

**Epic:** Config/Secrets Compliance
**Repo:** lookout
**Status:** Draft
**Per:** [ADR 0102](../../adrs/0102-signet-precedence-and-fallback-scope.md) — lookout's
first signet scoping; no prior ADR named it.

---

## Summary

Lookout is deliberately the simplest service in this design (ADR 0035 — "no `consequent`, no
database, no per-tenant config of its own"), and stays that way — this story does not add config
weight for its own sake. It has exactly one setting worth signet-sourcing: `LOOKOUT_RABBITMQ_URL`,
currently hardcoded plaintext (including real broker credentials) directly in
`manifests/1X-lookout.yaml`, bypassing the secret scope that was already provisioned for it and
never consumed.

## Acceptance Criteria

- [ ] Add the minimal bootstrap surface (`SIGNET_NAMESPACE`, `SIGNET_SERVICE` default `'lookout'`,
      `SIGNET_ADDR`, `SIGNET_TRUST_DOMAIN`), following the `dialWorkload`/`getServiceBundle`
      pattern used elsewhere. Presence of `SIGNET_ADDR` gates Signet-Configured Mode; its absence
      preserves today's plain-env `LOOKOUT_RABBITMQ_URL` behavior (Env-Only Mode).
- [ ] In Signet-Configured Mode, `rabbitmqUrl` is sourced from `bundle.rabbitmqUrl` /
      `secrets.rabbitmqUrl`, fail-loud if missing — no hardcoded default, no env fallback in this
      mode.
- [ ] `PORT` remains plain env in both modes — it's infra-level, not tenant/operator config, and
      out of scope for signet per ADR 0102's product-default carve-out.
- [ ] `authstar-integration`'s `manifests/1X-lookout.yaml` stops hardcoding the RabbitMQ URL
      directly; the already-provisioned (but currently unused) secret scope in
      `secrets/authstar/lookout/` is wired up and consumed.

## Not Covered Here

- Adding any other config surface to lookout — ADR 0035's "stays simple by construction" holds;
  this story exists solely to close the one live credential-hardcoding gap.
