---
id: D-0019
title: "T-0038 is blocked: the harness cannot serve a tenant's JWKS in-cluster. Split criterion 3's harness half: A"
kind: answer
sources: [TH-0021]
topics: [chronicle, node, integration, shell, code, all]
paths: [chronicle/package.json, chronicle/package-lock.json, chronicle/src/lib/auth.ts, chronicle/src/lib/config.ts, chronicle/src/lib/signet-bundle-config.ts, chronicle/src/lib/build-app.ts, chronicle/src/lib/fastify-augment.d.ts, chronicle/src/server.ts, chronicle/src/routes/auth-funnel.ts, chronicle/src/routes/active-users.ts, chronicle/src/routes/query.ts, chronicle/src/routes/export-summary.ts, chronicle/spec/lib/jwt.ts, chronicle/spec/lib/test-config.ts, chronicle/spec/behavior/auth-funnel.spec.ts, chronicle/spec/behavior/active-users.spec.ts, chronicle/spec/behavior/query.spec.ts, chronicle/spec/behavior/export-summary.spec.ts, chronicle/spec/behavior/config.spec.ts, chronicle/spec/behavior/signet-bundle-config.spec.ts, chronicle/spec/e2e/ingest-then-report.spec.ts, chronicle/spec/integration/clickhouse.integration.spec.ts, chronicle/spec/integration/rabbitmq.integration.spec.ts, chronicle/TESTING.md, chart/values.yaml, chart/templates/chronicle/deployment.yaml, chart/README.md, integration/manifests/14-chronicle.yaml, integration/manifests/17-portcullis.yaml, integration/config/authstar/chronicle.yaml, integration/config/authstar/portcullis.yaml, integration/secrets/authstar/chronicle/internalJwtSecret.yaml, integration/scripts/lib-secrets.sh, integration/scripts/scenario-golden-path.sh, integration/README.md, docs/operators/chronicle-configuration.md, docs/operators/index.md, design/system/overview.md, design/tech/tech-stack.md, design/issues/I-0001-node-services-ship-with-node-tls-reject-unauthorized-0-to-reach-tower-over-mtls.md, design/issues/summary.md, design/issues/I-0006-harness-herald-yaml-and-keep-yaml-point-towerbaseurl-at-http-while-tower-serves.md, design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0019 T-0038 is blocked: the harness cannot serve a tenant's JWKS in-cluster. Split criterion 3's harness half: A

The operator, bytepunx, answered TH-0021 at 2026-11-06T18:19:02Z.

What was asked:

```text
The golden path's chronicle step cannot pass with a genuine portcullis token through config alone. Recorded as I-0007.
```

The answer:

```text
A
```

Source: TH-0021.
