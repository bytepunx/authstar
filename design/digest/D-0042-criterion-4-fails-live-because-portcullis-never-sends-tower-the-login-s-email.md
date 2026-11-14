---
id: D-0042
title: "Criterion 4 fails live because portcullis never sends tower the login's email, so no invite can be redeemed: fix portcullis in S-0017: 1"
kind: answer
sources: [TH-0048]
topics: [analytics, tls, integration, shell, tower, node, code, all]
paths: [integration/scripts/harness-tls.sh, integration/scripts/deploy.sh, integration/manifests/14-chronicle.yaml, integration/config/authstar/chronicle.yaml, integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md, design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md, design/issues/summary.md, scripts/kluster-deploy.sh, design/stories/tower/012-tenant-creation-and-provisioning.md, tower/spec/behavior/provisioning.spec.ts, tower/src/routes/provisioning.ts, design/issues/I-0025-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md, tower/spec/lib/fakes.ts]
date: 2026-11-14
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0042 Criterion 4 fails live because portcullis never sends tower the login's email, so no invite can be redeemed: fix portcullis in S-0017: 1

The operator, bytepunx, answered TH-0048 at 2026-11-14T05:01:49Z.

What was asked:

```text
Criteria 1, 2, 3, and 5 are verified live on s-0017 at b630f32. Criterion 4 fails with chronicle's `403 missing required permission: analytics:read`. Chronicle answers 401 to a token it cannot verify, so this 403 means it verified the portcullis-forwarded ES256 token through the TLS front. What is missing is the permission.
```

The answer:

```text
1
```

Source: TH-0048.
