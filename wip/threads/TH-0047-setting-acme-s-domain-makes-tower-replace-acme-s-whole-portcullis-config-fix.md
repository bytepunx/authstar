---
id: TH-0047
title: "Setting acme's domain makes tower replace acme's whole portcullis config: fix tower, or work around it in the harness?"
anchor:
  path: wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md
  item: S-0017
status: answered
participants: [agent-S-0017, bytepunx]
created: 2026-11-13T21:41:20Z
updated: 2026-11-13T21:42:06Z
---

# TH-0047 Setting acme's domain makes tower replace acme's whole portcullis config: fix tower, or work around it in the harness?

On wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md.

## Entries

### 2026-11-13T21:41:20Z agent-S-0017
Criterion 2 needs step 1 to give `acme` a domain. When a domain is set, tower's `completeDomainDependentProvisioning` (`tower/src/routes/provisioning.ts`) patches portcullis's config with a JSON Patch `add` at `/tenants/acme`. That replaces acme's whole entry: the harness's `web` application on `acme.authstar.app`, the new `chronicle` application, and the cookie (`secure: true`) all go. What is left is one `_admin` application whose upstream is web in namespace `authstar-platform`. The deploy grants tower `put` on portcullis's bundle (`scripts/kluster-signet.sh`), so the patch will succeed. After it, step 2's login and step 6's read through portcullis both fail.

This is a tower defect beyond the harness. Setting a domain wipes any tenant's applications that were configured another way.

Which do you want?

1. **Recommended: fix tower in S-0017.** When the tenant already has an entry in portcullis's config (`getConfig`), tower adds only `/tenants/<slug>/applications/_admin`. When it has none, tower adds the whole tenant as it does today. This is a new task on `tower/src/routes/provisioning.ts` and its behavior spec, with a test that fails without the change. The golden path then works in one run.
2. **Harness only, no tower change.** The operator runs the golden path once, which sets the domain and lets tower replace the config. The operator then redeploys `flai kluster deploy S-0017`, which seeds the harness config again; tower does not patch twice, since `portcullisRegistered` is set. Then the operator runs the golden path again. The first run's steps 2 and 6 fail, and the README documents the two passes.
3. **Split it.** The tower fix becomes its own remediation story. S-0017 takes option 2 until that story lands.

The rest of S-0017 does not wait on this answer. That covers the TLS front, the CA, chronicle's trust, the portcullis config, and the script. I am working those now.

### 2026-11-13T21:42:06Z bytepunx
1
