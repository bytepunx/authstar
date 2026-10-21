---
id: ADR-0102
title: Signet Precedence, Fallback Scope, and Missing-Field Behavior
status: accepted
date: 2026-08-31
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0102: Signet Precedence, Fallback Scope, and Missing-Field Behavior

- **Status:** Accepted
- **Date:** 2026-08-31
- **Affects:** chronicle, herald, keep, lookout, portcullis, steward, tower, web
- **Supersedes (in part):** [ADR 0004](0004-signet-for-configuration-and-secrets.md) — narrows "no
  static-YAML-only deployment mode" to "no static-only mode once signet is configured"; reaffirms
  everything else in ADR 0004 unchanged
- **Formalizes an already-accepted decision for:** chronicle (per [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md))

## Context

An audit of all eight services (2026-08-31) found every one of them either partially or fully out
of compliance with ADR 0004's config/secrets model, in three distinct ways:

1. **Undocumented scope.** ADR 0004's "Affects" line names only portcullis, tower, keep, web.
   Herald already dials signet in practice (assumed by [ADR 0052](0052-keep-herald-own-signet-access.md)
   and [ADR 0081](0081-herald-key-rotation.md), never explicitly granted). Chronicle was
   separately, explicitly brought into scope by ADR 0036 ("no exceptions") but its
   implementation never followed through — it reads thirteen settings from plain `process.env`
   with zero signet wiring, including `CHRONICLE_INTERNAL_JWT_SECRET` defaulting to the literal
   string `dev-only-insecure-secret`, which the cluster manifest currently sets verbatim. Lookout
   has no ADR coverage at all and is fully env-based, including a RabbitMQ URL with live broker
   credentials hardcoded in the k8s manifest. Steward and web were never brought into scope for
   their plain config (`TOWER_URL`, `HERALD_URL`, `KEEP_BASE_URL`); web's `INTERNAL_JWT_JWKS_URL`
   sitting permanently unset is separately tracked ([ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md),
   [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md)) as a consequence of this.

2. **Undefined missing-field behavior.** ADR 0004 and its implementing story never specify what a
   service should do when signet is reachable and returns a bundle, but that bundle is missing a
   field the service expects. In practice this produced two different silent-fallback patterns,
   neither of them fail-loud:
   - `secrets.signetAdminToken ?? requireEnv('SIGNET_ADMIN_TOKEN')` (herald, keep, tower) — a real,
     standing non-signet path for a credential, gated only on that one field being absent from the
     bundle.
   - Hardcoded literal defaults substituted with no error at all: tower's `provisioning.*` block
     (`selfServiceEnabled ?? false`, `operatorToken ?? ''`, `defaultProvider ?? {name: '', ...}`,
     `default-provider-client-secret ?? ''`), herald's `operatorToken ?? ''`, and keep's
     `KEEP_CREDENTIAL_SALT`, which never reads the bundle at all and defaults straight to a fixed
     dev value. Keep's own code comment cites ADR 0079 to justify this, but ADR 0079's rationale
     is about the *credential secret itself* leaving authstar's trust boundary to an external
     application — it says nothing about the salt used to hash it, which never leaves the trust
     boundary and has no principled reason to sit outside signet. That citation doesn't hold up
     and this ADR retires it.

3. **No stated precedence when both a bundle value and an env value exist.** Nothing currently
   guarantees signet wins.

## Decision

Two operating modes, gated on the presence of signet's bootstrap coordinates.

### Two operating modes, gated on the presence of signet's bootstrap coordinates

A service is in **Signet-Configured Mode** the moment its bootstrap env vars — signet address (or
equivalent dial coordinate), trust domain, namespace, and (where applicable) admin address and
SPIFFE socket path — are present. Otherwise it's in **Env-Only Mode**.

- **Env-Only Mode is a legitimate, permitted mode** for chronicle, lookout, steward, and web
  (softening ADR 0004's "no static-YAML-only deployment mode" for these four — portcullis, tower,
  keep, and herald already require signet unconditionally today, via `requireEnv` on their
  bootstrap vars with no fallback, and continue to). It exists so a
  service can run without signet wired in yet, or in a local/self-hosted deployment that hasn't
  adopted signet. Every setting, including secrets, is sourced from plain env vars in this mode.
- **Signet-Configured Mode is authoritative.** The instant bootstrap coordinates are present, the
  service must dial signet, and every non-bootstrap setting — config and secrets alike — is
  sourced exclusively from the fetched bundle. A conflicting env var, if still set, is ignored,
  not merged or preferred. This is the precedence rule ADR 0004 assumed but never stated: **a
  configured signet always overrides env vars**, with no per-field opt-out.

### Missing bundle field in Signet-Configured Mode = fail loud, not fall back

Once a service is in Signet-Configured Mode, if the bundle is missing a field the service expects,
the service fails startup with an error naming the missing field and the signet path/secret name
it needs provisioned. It does **not** fall back to env, and it does **not** substitute a hardcoded
literal default. This closes both failure patterns in Context #2:

- The `secrets.X ?? requireEnv('X')` pattern becomes `secrets.X ?? throw` when in Signet-Configured
  Mode; the env fallback only applies in Env-Only Mode.
- Hardcoded literal defaults (`?? false`, `?? ''`, `?? {}`) for anything that is real config or a
  secret are removed. A missing `provisioning.defaultProvider` or `operatorToken` in a fetched
  bundle is an operator provisioning gap, and must be surfaced as a startup failure, not silently
  absorbed as "off"/"empty."

This does not apply to genuinely optional, non-secret fields with a documented product-level
default (e.g. portcullis's `WebUpstreamConfig.timeout` defaulting via `#[serde(default = ...)]`) —
those remain compliant exactly as portcullis already implements them, since the default there is a
product decision, not a credential or a piece of tenant/operator config standing in for something
that should have been provisioned.

### Scope corrections

- **Herald** is formally added to ADR 0004's "Affects" list — codifying what ADR 0052/0081 already
  assumed.
- **Chronicle**'s ADR 0036 scoping is reaffirmed; its current env-only implementation is drift
  from an already-accepted decision, tracked as a compliance bug, not a new design question.
- **Lookout** is newly brought into signet's scope for its one secret-bearing setting
  (`LOOKOUT_RABBITMQ_URL`).
- **Steward** and **web** are brought into scope for their plain config URLs
  (`TOWER_URL`/`HERALD_URL` and `TOWER_BASE_URL`/`PUBLIC_TOWER_BASE_URL`/`KEEP_BASE_URL`/
  `INTERNAL_JWT_JWKS_URL` respectively) under the same Env-Only/Signet-Configured split — these
  aren't secrets, but the same "signet overrides when configured" precedence applies to plain
  config, not just secrets, per the original scope of this audit.

## Consequences

- **keep**: `KEEP_CREDENTIAL_SALT` moves into the signet bundle/secrets as a real signet-sourced
  value when in Signet-Configured Mode; the hardcoded `'keep-dev-salt'` literal and its ADR 0079
  citation are removed from `hash.ts`, replaced with an Env-Only-Mode-only fallback plus a
  fail-loud path for Signet-Configured Mode.
- **herald**: `operatorToken` and the `SIGNET_ADMIN_TOKEN` pattern both move to fail-loud-on-missing
  in Signet-Configured Mode.
- **tower**: the entire `provisioning.*` block loses its hardcoded literal defaults in
  Signet-Configured Mode; same `SIGNET_ADMIN_TOKEN` fix as herald/keep.
- **chronicle**: gains signet wiring for the first time (bootstrap dial, bundle-sourced
  `clickhousePassword`, `rabbitmqUrl`, `internalJwtSecret`), matching the pattern already used by
  keep/herald/tower. Env-Only Mode remains available and unchanged for local dev.
- **lookout**: gains signet wiring for `LOOKOUT_RABBITMQ_URL`, same pattern.
- **steward, web**: gain optional signet sourcing for their plain config URLs; Env-Only Mode
  (today's behavior) is unaffected when bootstrap coordinates aren't present.
- **portcullis**: no changes — already compliant with everything this ADR states.
- A story is written per affected service under `stories/<service>/` before implementation, per
  this repo's normal convention.

## Related

- [ADR 0004](0004-signet-for-configuration-and-secrets.md) — the underlying hard-dependency
  decision this ADR narrows and adds missing-field precedence to
- [ADR 0036](0036-chronicle-reporting-api-and-retention-config.md) — chronicle's original,
  unimplemented signet scoping
- [ADR 0052](0052-keep-herald-own-signet-access.md), [ADR 0081](0081-herald-key-rotation.md) —
  assumed herald's bundle existed; this ADR makes that explicit
- [ADR 0079](0079-batched-usage-reporting-credentials.md) — the credential-secret trust-boundary
  rationale that keep's code comment over-applied to `KEEP_CREDENTIAL_SALT`
- [ADR 0086](0086-jwks-endpoint-for-internal-jwt-verification.md), [ADR 0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md) — web's `INTERNAL_JWT_JWKS_URL` gap, addressed as part of this ADR's steward/web scope correction
