---
id: D-0041
title: "Setting acme's domain makes tower replace acme's whole portcullis config: fix tower, or work around it in the harness: 1"
kind: answer
sources: [TH-0047, S-0017, T-0137, T-0138]
topics: [tower, node, integration, code, all]
paths: [tower/src/routes/provisioning.ts, tower/spec/behavior/provisioning.spec.ts, integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, design/stories/tower/012-tenant-creation-and-provisioning.md]
date: 2026-11-13
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0041 Setting acme's domain makes tower replace acme's whole portcullis config: fix tower, or work around it in the harness: 1

Setting a tenant's domain is fixed in tower, not worked around in the harness: tower's portcullis registration must not replace a tenant entry portcullis already configures.

S-0017's agent asked on TH-0047: when a domain is set, tower's `completeDomainDependentProvisioning` (`tower/src/routes/provisioning.ts`) patches portcullis's config with a JSON Patch `add` at `/tenants/<slug>`, which "replaces acme's whole entry": its other applications and its cookie go, leaving one `_admin` application. "This is a tower defect beyond the harness. Setting a domain wipes any tenant's applications that were configured another way." It offered three options: (1) fix tower in S-0017, so that tower adds only `/tenants/<slug>/applications/_admin` when the tenant already has an entry, and the whole tenant otherwise; (2) a two-pass harness workaround with no tower change; (3) a separate remediation story.

The operator, bytepunx, answered at 2026-11-13T21:42:06Z: "1", the recommended fix in S-0017.

S-0017 did it in T-0137, and T-0138 changed how tower decides: tower cannot read portcullis's config, since signet refuses `GetServiceConfig` on the workload listener (I-0025). So registration "tries the narrow `_admin` add first and falls back to the whole tenant only when signet rejects the patch itself". A wrong fallback fails rather than wiping a configured tenant.

Source: TH-0047, S-0017, T-0137, T-0138.
