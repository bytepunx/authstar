---
id: D-0041
title: "Setting acme's domain makes tower replace acme's whole portcullis config: fix tower, or work around it in the harness: 1"
kind: answer
sources: [TH-0047]
topics: [analytics, tls, integration, shell, code, all]
paths: [integration/scripts/harness-tls.sh, integration/scripts/deploy.sh, integration/manifests/14-chronicle.yaml, integration/config/authstar/chronicle.yaml, integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md, design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md, design/issues/summary.md, scripts/kluster-deploy.sh]
date: 2026-11-13
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0041 Setting acme's domain makes tower replace acme's whole portcullis config: fix tower, or work around it in the harness: 1

The operator, bytepunx, answered TH-0047 at 2026-11-13T21:42:06Z.

What was asked:

```text
Criterion 2 needs step 1 to give `acme` a domain. When a domain is set, tower's `completeDomainDependentProvisioning` (`tower/src/routes/provisioning.ts`) patches portcullis's config with a JSON Patch `add` at `/tenants/acme`. That replaces acme's whole entry: the harness's `web` application on `acme.authstar.app`, the new `chronicle` application, and the cookie (`secure: true`) all go. What is left is one `_admin` application whose upstream is web in namespace `authstar-platform`. The deploy grants tower `put` on portcullis's bundle (`scripts/kluster-signet.sh`), so the patch will succeed.…
```

The answer:

```text
1
```

Source: TH-0047.
