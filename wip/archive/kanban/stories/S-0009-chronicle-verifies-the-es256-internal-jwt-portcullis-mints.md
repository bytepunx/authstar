---
id: S-0009
type: story
nature: remediation
title: Chronicle verifies the ES256 internal JWT portcullis mints
status: done
parent: E-0003
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-11-06T21:11:49Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
  - to: in-progress
    at: 2026-11-06T17:53:46Z
    by: agent-S-0009
  - to: review
    at: 2026-11-06T18:44:42Z
    by: agent-S-0009
  - to: done
    at: 2026-11-06T21:11:49Z
    by: bytepunx
blocked:
  - from: 2026-11-06T18:11:01Z
    until: 2026-11-06T18:17:39Z
    reason: awaiting the operator on TH-0011
tags: [chronicle]
touches: [chronicle/package.json, chronicle/package-lock.json, chronicle/src/lib/auth.ts, chronicle/src/lib/config.ts, chronicle/src/lib/signet-bundle-config.ts, chronicle/src/lib/build-app.ts, chronicle/src/lib/fastify-augment.d.ts, chronicle/src/server.ts, chronicle/src/routes/auth-funnel.ts, chronicle/src/routes/active-users.ts, chronicle/src/routes/query.ts, chronicle/src/routes/export-summary.ts, chronicle/spec/lib/jwt.ts, chronicle/spec/lib/test-config.ts, chronicle/spec/behavior/auth-funnel.spec.ts, chronicle/spec/behavior/active-users.spec.ts, chronicle/spec/behavior/query.spec.ts, chronicle/spec/behavior/export-summary.spec.ts, chronicle/spec/behavior/config.spec.ts, chronicle/spec/behavior/signet-bundle-config.spec.ts, chronicle/spec/e2e/ingest-then-report.spec.ts, chronicle/spec/integration/clickhouse.integration.spec.ts, chronicle/spec/integration/rabbitmq.integration.spec.ts, chronicle/TESTING.md, chart/values.yaml, chart/templates/chronicle/deployment.yaml, chart/README.md, integration/manifests/14-chronicle.yaml, integration/manifests/17-portcullis.yaml, integration/config/authstar/chronicle.yaml, integration/config/authstar/portcullis.yaml, integration/secrets/authstar/chronicle/internalJwtSecret.yaml, integration/scripts/lib-secrets.sh, integration/scripts/scenario-golden-path.sh, integration/README.md, docs/operators/chronicle-configuration.md, docs/operators/index.md, design/system/overview.md, design/tech/tech-stack.md, design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md, design/issues/summary.md, design/issues/I-0006-harness-herald-yaml-and-keep-yaml-point-towerbaseurl-at-http-while-tower-serves.md, design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md]
usage:
  source: log
  seconds: 2672
  priced_by: harness
  turns:
    - day: 2026-11-06
      ceremony: 4
      hand_edits: 5
      work: 94
  models:
    - model: claude-opus-5-5
      input: 352
      output: 90022
      cache_read: 36185200
      cache_write: 454288
      cost: 12.3047
  strategic:
    - kind: orchestrator
      seconds: 64
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 44
          output: 311
          cache_read: 1238238
          cache_write: 221252
          cost: 1.7218
cost_of_delay:
  value: 64.29
  by: planner-S-0009
  at: 2026-11-06T18:09:19Z
forecast:
  duration: 6h
  delivery: 2026-11-07T00:46:00Z
  basis: "No done stories with usage yet, so planning.default_duration's 1h is raised to 6h for five tasks across chronicle code and tests, the chart, a live-harness step with in-cluster JWKS wiring, and operator docs; delivery is flai forecast's start behind S-0008 and S-0003 plus 6h."
  by: planner-S-0009
  at: 2026-11-06T17:52:15Z
---
# S-0009 Chronicle verifies the ES256 internal JWT portcullis mints

## Goal

Chronicle's `analytics:read` routes accept the internal JWT portcullis forwards, verified against the tenant's JWKS the way web and the SDKs verify it, so the shared-secret HS256 path and its insecure default are gone.

## Acceptance criteria
- [x] Chronicle verifies ES256 tokens per tenant via the JWKS URL convention (ADR-0086, ADR-0091), using the same verification the `@bytepunx/authstar-core` client provides
- [x] `CHRONICLE_INTERNAL_JWT_SECRET` and the `dev-only-insecure-secret` default are removed from config, the chart, and the integration manifests
- [x] Behavior and e2e tests mint ES256 test tokens
- [x] `docs/operators/` lists chronicle's configuration

## Tasks
- T-0034 Chronicle's analytics:read routes verify the ES256 internal JWT per tenant through authstar-fastify
- T-0036 Chronicle's integration tier and TESTING.md mint ES256 test tokens
- T-0037 Chart and integration manifests drop chronicle's internal JWT secret and give it towerBaseUrl
- T-0038 Golden path's chronicle-report step reads the report with a portcullis-forwarded ES256 token
- T-0039 docs/operators lists chronicle's configuration and the overview drops the shared-secret gap
- T-0086 Golden path step 6 skips chronicle until S-0017, and the integration README states chronicle's ES256 verification

## Notes

`chronicle/src/lib/auth.ts` and `config.ts`; `portcullis/crates/authstar-middleware/src/jwt/internal.rs` signs ES256. The integration README records that the golden path self-mints an HS256 token because a real one could never pass.

### Criterion 3 split (TH-0021)

The operator chose on 2026-11-06 to move criterion 3's harness half to S-0017, "Golden path reads chronicle's report with a portcullis-forwarded ES256 token". The original wording was "Behavior and e2e tests mint ES256 test tokens; the integration harness's chronicle-report step passes with a genuine portcullis-forwarded token". The harness cannot serve a tenant's JWKS at `https://authstar.<domain>` in-cluster (I-0007), which needs a TLS front and DNS beyond this story. T-0038 is cancelled. Until S-0017 lands, golden-path step 6 skips chronicle and says why, because chronicle now refuses the HS256 token it used to self-mint.

### Planning

Touches. The story declared none, and `flai touches suggest` had nothing to start from, so every touch comes from the goal, the criteria, the linked design, and the code layout:

- Layout (criterion 1): the chronicle source and spec files that carry `internalJwtSecret` or HS256 signing. These are `src/lib/auth.ts`, `config.ts`, `signet-bundle-config.ts`, `build-app.ts`, `fastify-augment.d.ts`, `server.ts`, the four `analytics:read` routes, `spec/lib/*`, the behavior specs, and the e2e spec. Also `package.json` and its lock, for the new `@bytepunx/authstar-fastify` dependency herald already uses.
- Design (criterion 1, ADR-0086, ADR-0091): `design/tech/tech-stack.md`, because a new dependency is recorded there. Also `chronicle/TESTING.md` and the integration specs, which describe or sign HS256.
- Layout (criterion 2): `chart/values.yaml`, `chart/templates/chronicle/deployment.yaml`, `chart/README.md`, `integration/manifests/14-chronicle.yaml`, `integration/config/authstar/chronicle.yaml`, `integration/secrets/authstar/chronicle/internalJwtSecret.yaml`, and `integration/scripts/lib-secrets.sh`. All of them name the secret.
- Layout (criterion 3): `integration/scripts/scenario-golden-path.sh` (step 6 self-mints HS256) and `integration/README.md` (the known-gap bullet). Also `integration/config/authstar/portcullis.yaml` and `integration/manifests/17-portcullis.yaml`, for a forwarding path and an in-cluster JWKS host.
- Layout (criterion 4): `docs/operators/chronicle-configuration.md` (new) and `docs/operators/index.md`. Design: `design/system/overview.md`, whose line on chronicle's shared-secret gap becomes false.
- No folder touches. T-0038 may need a new manifest for in-cluster DNS or TLS; it widens its touches when it closes.

Tag `chronicle` was added because `flai check` asks a story touching several components to name the one it delivers to: chronicle.

No `after`. S-0009 reads nothing S-0010 writes, and the JWKS route and `perTenantJwksKeyProvider` it builds on are already in the tree.

Forecast: 6h, raised from the default 1h. `flai forecast` had no done stories with usage, so it used `planning.default_duration`. Five tasks span chronicle code and tests, the chart, a harness step whose in-cluster JWKS path is unproven, and docs. Delivery is `flai forecast`'s start, behind S-0008 and S-0003 with an in-progress limit of 2, plus 6h.

Cost of delay: 64.29 USD a week, as `flai cod S-0009` gives it, unadjusted. The operator set E-0003's inputs on TH-0007: revenue 0, penalty 0, and 30m lost per cycle. With `planning.hour_rate` at 150 USD, E-0003 is worth 75 USD a week. S-0009 takes 6h of the 7h forecast across E-0003's two open stories, S-0009 and S-0010. This share moves if S-0010's planner changes S-0010's 1h forecast; rerun `flai cod S-0009` then.
