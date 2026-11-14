---
id: D-0019
title: "T-0038 is blocked: the harness cannot serve a tenant's JWKS in-cluster. Split criterion 3's harness half: A"
kind: answer
sources: [TH-0021, S-0009, S-0017, I-0007]
topics: [chronicle, node, integration, shell, code, all]
paths: [chronicle/package.json, chronicle/package-lock.json, chronicle/src/lib/auth.ts, chronicle/src/lib/config.ts, chronicle/src/lib/signet-bundle-config.ts, chronicle/src/lib/build-app.ts, chronicle/src/lib/fastify-augment.d.ts, chronicle/src/server.ts, chronicle/src/routes/auth-funnel.ts, chronicle/src/routes/active-users.ts, chronicle/src/routes/query.ts, chronicle/src/routes/export-summary.ts, chronicle/spec/lib/jwt.ts, chronicle/spec/lib/test-config.ts, chronicle/spec/behavior/auth-funnel.spec.ts, chronicle/spec/behavior/active-users.spec.ts, chronicle/spec/behavior/query.spec.ts, chronicle/spec/behavior/export-summary.spec.ts, chronicle/spec/behavior/config.spec.ts, chronicle/spec/behavior/signet-bundle-config.spec.ts, chronicle/spec/e2e/ingest-then-report.spec.ts, chronicle/spec/integration/clickhouse.integration.spec.ts, chronicle/spec/integration/rabbitmq.integration.spec.ts, chronicle/TESTING.md, chart/values.yaml, chart/templates/chronicle/deployment.yaml, chart/README.md, integration/manifests/14-chronicle.yaml, integration/manifests/17-portcullis.yaml, integration/config/authstar/chronicle.yaml, integration/config/authstar/portcullis.yaml, integration/secrets/authstar/chronicle/internalJwtSecret.yaml, integration/scripts/lib-secrets.sh, integration/scripts/scenario-golden-path.sh, integration/README.md, docs/operators/chronicle-configuration.md, docs/operators/index.md, design/system/overview.md, design/tech/tech-stack.md, design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md, design/issues/summary.md, design/issues/I-0006-harness-herald-yaml-and-keep-yaml-point-towerbaseurl-at-http-while-tower-serves.md, design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: [S-0006, S-0007, S-0010, TH-0031, TH-0034, TH-0043, TH-0049]
---

# D-0019 T-0038 is blocked: the harness cannot serve a tenant's JWKS in-cluster. Split criterion 3's harness half: A

The operator chose answer A on TH-0021: the integration harness's half of S-0009's criterion 3, reading chronicle's report with a genuine portcullis-forwarded ES256 token, split off into its own story under E-0003, S-0017 "Golden path reads chronicle's report with a portcullis-forwarded ES256 token". S-0009 kept only the half its behavior and e2e tests prove with ES256 test tokens.

The reason (I-0007): chronicle fetches `https://authstar.<domain>/.well-known/jwks.json`, with the scheme fixed in `@bytepunx/authstar-fastify`, but portcullis listens plain HTTP on 3710, nothing in `integration/` terminates TLS, no in-cluster DNS maps `authstar.<domain>`, and step 1 creates `acme` without a domain. Fixing it needs a TLS front with a self-signed cert, a CoreDNS rewrite, CA trust in chronicle, and script and config changes, about a story of work that only a live cluster proves. The rejected answers were B, widen S-0009 to do it untested, and C, leave criterion 3 unticked and step 6 failing.

What S-0009 did on that answer: it cancelled T-0038, and T-0086 made golden-path step 6 check only that chronicle refuses an unauthenticated report (401) and skip the token read until S-0017; `integration/README.md` says so. The operator answered at 2026-11-06T18:19:02Z: "A".

Source: TH-0021, S-0009, S-0017, I-0007.
