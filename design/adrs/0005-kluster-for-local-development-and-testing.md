---
id: ADR-0005
title: kluster for Local Development and Testing
status: accepted
date: 2026-07-21
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0005: kluster for Local Development and Testing

- **Status:** Accepted
- **Date:** 2026-07-21
- **Affects:** portcullis, tower, keep, web, design (workspace-level tooling)

## Context

The original workspace plan (see workspace-root `claude.md`, prior revision) called for a
`compose` project able to run the entire system locally via docker compose. Given ADR 0004's
hard dependency on signet — which is explicitly Kubernetes/SPIFFE-SPIRE-native with no
non-Kubernetes workload-access path — a docker-compose-based local environment can't exercise
real config/secret delivery at all. kluster (`~/git/kluster`) already exists to solve this: it
provisions disposable k3d (local) or kind (CI) clusters via composable profiles, and already
has a purpose-built `authstar` profile.

## Decision

There is no `compose` folder and no docker-compose story for authstar. Local development and
CI both use kluster's `authstar` profile:

```bash
kluster up --profile authstar --name dev-authstar
```

This composes `spire` → `signet` → `authstar`, providing:

| Component | Purpose |
|---|---|
| SPIRE Server/Agent + Controller Manager | SPIFFE workload identity substrate |
| cert-manager, Traefik | TLS lifecycle and ingress termination |
| Signet + in-cluster CockroachDB (dev-only, pre-unsealed) | Config/secrets delivery per ADR 0004 |
| RabbitMQ (single-node + management UI) | Message broker |
| Dex | Local OIDC provider for end-to-end auth flow testing |

CI uses the same profile with `--provider kind` (kluster's CI-optimized runtime).

Authstar itself needs no ingress controller beyond what kluster already provisions — portcullis
*is* the system's edge/ingress proxy, so Traefik in the `spire` profile only needs to reach
portcullis, not front every individual service.

## Consequences

- Workspace-root `claude.md`'s folder structure no longer lists a `compose`/`cluster` project;
  local/CI testing setup is "install kluster, run the `authstar` profile" against the existing
  external tool, not something authstar's own repos build or maintain.
- **Resolves an open item from [ADR 0001](0001-claims-enrichment-via-tower.md):** the
  `authstar` kluster profile already provisions RabbitMQ specifically for authstar, which is a
  strong signal (not yet explicitly confirmed in this ADR set) that RabbitMQ is the intended
  keep → tower async messaging transport referenced there. Needs an explicit confirmation
  before being treated as settled — tracked, not assumed.
- Dex ships with a **fixed** OAuth client (`authstar` / `authstar-dev-secret`) that "AuthStar's
  config depends on this exact value" per kluster's own docs. Story 001-equivalent default/dev
  configuration examples should use this Dex client as the standard local OIDC provider entry,
  the same role Google/Okta/etc. examples play for production.
- Whatever authstar's own Helm charts/deployment manifests turn out to be (a `deploy` repo?
  something else?) is a separate, not-yet-discussed decision — kluster provisions the
  surrounding substrate (SPIRE/signet/RabbitMQ/Dex) and applies "AuthStar-specific Helm values
  and RBAC," but where authstar's own chart definitions live hasn't been decided.

## Related

- `~/git/kluster/README.md`, `~/git/kluster/CLAUDE.md`
- [ADR 0004](0004-signet-for-configuration-and-secrets.md)
