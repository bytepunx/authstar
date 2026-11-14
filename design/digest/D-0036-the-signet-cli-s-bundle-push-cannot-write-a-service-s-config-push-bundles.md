---
id: D-0036
title: "The signet CLI's bundle push cannot write a service's config: push bundles through SyncBundle with @bytepunx/signet-client, as scripts/kluster-signet-push.mjs does"
kind: decision
sources: [S-0019, T-0090, TH-0031, S-0025, T-0129]
topics: [kluster, signet, integration, deployment]
paths: [scripts/kluster-signet-push.mjs, scripts/kluster-signet.sh, scripts/kluster-teardown.sh, scripts/kluster-signet-remove.mjs, integration/config/authstar]
date: 2026-11-10
status: active
absorbed_by: ""
asked_again: []
cited: [TH-0031, TH-0049]
---

# D-0036 The signet CLI's bundle push cannot write a service's config: push bundles through SyncBundle with @bytepunx/signet-client, as scripts/kluster-signet-push.mjs does

S-0019 planned to seed each story namespace's signet bundles with the signet CLI's `bundle push`. T-0090 replaced it with `scripts/kluster-signet-push.mjs` over `@bytepunx/signet-client`. S-0019's Notes give the reason: "Signet 0.10.3's `bundle push` sends no `config_path`, so it cannot write a config (signet's `server/cmd/signet/bundle_cmd.go`)." S-0006's agent hit the same limit on TH-0031: "`signet bundle push` carries no config".

What follows from it:

- To change a service's config in a cluster, push its whole bundle through `SyncBundle` with the client. The push needs `tower/node_modules`, and the deploy runs `npm ci` in `tower` when the checkout has none.
- `SyncBundle` adds or updates and never deletes. Pushing one namespace's bundles leaves the other namespaces alone.
- The signet CLI cannot delete a bundle either. S-0025's T-0129 found the client can: "`@bytepunx/signet-client` 0.9.0 exposes AdminService DeleteSecret and DeleteConfig". `scripts/kluster-teardown.sh` now removes a story namespace's config and every secret the push wrote through `scripts/kluster-signet-remove.mjs`, passing over what is already gone. A secret a service wrote at runtime under a name `lib-secrets.sh` does not list stays behind, since signet lists no namespace's secrets to an admin token (`scripts/README.md`).
- The namespace's fresh keys are kept in `$FLAI_KLUSTER_STATE/signet-secrets.json`, so a redeploy pushes the same ones. That file is where they live; they are never written into the repository.
- A redeploy's push counts as a bundle change, so chronicle restarts once on it (S-0025).

`scripts/README.md` lists the scripts. The operator's later answers on TH-0031, which took S-0006's live check to its own namespace, are in D-0034.

Source: S-0019, T-0090, TH-0031, S-0025, T-0129.
