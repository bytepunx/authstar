---
id: ADR-0104
title: Helm Chart for authstar, with a Signet-Provisioning Hook
status: accepted
date: 2026-09-03
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0104: Helm Chart for authstar, with a Signet-Provisioning Hook

- **Status:** Accepted
- **Date:** 2026-09-03
- **Affects:** chronicle, herald, keep, lookout, portcullis, steward, tower, web (all templated
  by the chart); a new repo, `authstar-chart`, is created to hold it
- **Depends on:** [ADR 0004](0004-signet-for-configuration-and-secrets.md) (signet hard
  dependency), [ADR 0102](0102-signet-precedence-and-fallback-scope.md) (Signet-Configured Mode
  is what the hook's writes activate), [ADR 0103](0103-spiffe-scoped-signet-writes-retire-admin-tokens.md)
  (services' own runtime access is SPIFFE-scoped — unaffected by this ADR, which concerns only
  the one-time provisioning path, not the services' steady-state signet access)

## Context

Deploying authstar today means manually running signet CLI commands (`signet secret set`,
bundle syncs) against each of the eight services' namespaces, then applying each service's k8s
manifests by hand — an ad-hoc process driven interactively, with no single artifact that
describes "how to stand up authstar." This doesn't compose with kluster, which already installs
its other addons (postgres, clickhouse, traefik, signet-admin) as Helm charts, and it has no
answer for a customer deploying authstar outside bytepunx's own cluster via plain `helm install`
or ArgoCD.

Signet's `PutServiceConfig` RPC (`GitOpsService`, added in signet server v0.11.0, exposed by
`@bytepunx/signet-client` v0.9.0 TS / v0.6 Rust) removed the previous blocker: plain config no
longer requires the caller to already have signet registered against a git repo, closing the gap
between config provisioning (previously git-only) and secret provisioning (already a direct API
call via `SyncBundle`). Both can now be driven by one provisioning step with no git repo
involved on the installer's side.

## Decision

A new repo, `authstar-chart`, holds the chart and its provisioning hook.

### A new repo, `authstar-chart`, holds the chart and its provisioning hook

The chart does not live in `authstar-design` (whose own `CLAUDE.md` scopes it to "why", not "how
to deploy") or in `portcullis` (which would couple one gateway service's repo to being the
deployment vehicle for all eight). `authstar-chart` is usable three ways: as a kluster addon
(matching how kluster already installs postgres/clickhouse/traefik/signet-admin), via plain
`helm install`, and via ArgoCD.

### The chart does not install or manage signet itself

Signet is a separate, already-running dependency. The chart only templates each of the eight
services' `Deployment`/`Service`/`ConfigMap`, and passes signet's bootstrap coordinates
(`SIGNET_ADDR`/`SIGNET_TRUST_DOMAIN`/`SIGNET_NAMESPACE`, per service) through as ordinary
`values.yaml`-driven env vars, activating each service's existing Signet-Configured Mode
(ADR 0102).

### Provisioning is a Helm hook, not part of the chart's core templating

A hook-annotated `Job` — `helm.sh/hook: pre-install,pre-upgrade` — runs before every install and
every upgrade, pushing each service's plain config via `PutServiceConfig` and its secrets via
`SyncBundle`. Both are safe to re-run unconditionally: `PutServiceConfig` is create-or-replace,
and re-running `SyncBundle` on every upgrade self-heals config drift at negligible cost, rather
than requiring the operator to remember a separate manual step for ordinary config changes.

### The hook is a TypeScript binary on `@bytepunx/signet-client` 0.9.0

This matches the majority of authstar services (chronicle, herald, keep, tower, web, steward are
already TS); the chart's own maintenance stays in the same language as most of what it deploys.

### The hook authenticates as a signet operator (bearer token), not its own SPIFFE identity

Writing config/secrets for all eight *other* services' namespaces is a cross-namespace/service
write, which requires either an operator bearer token (`dialAdmin`) or a pre-granted
`CreatePolicy` for the hook's own SPIFFE identity. The SPIFFE-identity route was rejected: it
requires an operator to register a SPIRE entry and run `CreatePolicy` for the hook *before* the
chart can be installed at all — a manual, non-templated prerequisite that would defeat the point
of a chart meant to replace ad-hoc, interactively-driven deployment. The chart instead takes an
operator bearer token as a `values.yaml`-referenced input, sourced from a Kubernetes `Secret` the
operator creates once (not templated by this chart, matching how kluster's other addons take
pre-existing credentials rather than generating them). The token is only read by the hook at
install/upgrade time; it is never mounted into any of the eight services' own pods, which
continue to use their existing SPIFFE-scoped runtime access (ADR 0103) unchanged.

## Consequences

- A new repo, `authstar-chart`, is created, containing the Helm chart (`templates/`,
  `values.yaml`) and the provisioning hook's source (a small TS project producing the hook
  container image).
- Each of the eight services' `Deployment` templates take signet bootstrap coordinates and image
  tag from `values.yaml`; no service-side code changes are required beyond what ADR 0102 already
  specifies.
- The operator-supplied bearer token is a new, explicit piece of required chart input,
  documented in `authstar-chart`'s README — a real standing credential requirement, scoped to
  install/upgrade time only.
- A story is written in `authstar-design`'s `stories/chart/` (this repo's normal convention: every
  service's stories live here regardless of which repo implements them) before implementation,
  covering: chart layout, the hook's exact `PutServiceConfig`/
  `SyncBundle` call sequence per service, hook failure behavior (a failed provisioning run must
  fail the Helm release, not partially apply), and the values.yaml schema for both the bearer
  token reference and each service's config/secret payloads.
- kluster gains a new addon entry once the chart is published, replacing whatever ad-hoc
  process it uses today to stand up authstar in a local cluster.

## Related

- [ADR 0004](0004-signet-for-configuration-and-secrets.md) — signet as authstar's hard
  config/secrets dependency
- [ADR 0102](0102-signet-precedence-and-fallback-scope.md) — Signet-Configured Mode, which the
  hook's writes activate on next service restart
- [ADR 0103](0103-spiffe-scoped-signet-writes-retire-admin-tokens.md) — services' own runtime
  signet access, unchanged by this ADR
