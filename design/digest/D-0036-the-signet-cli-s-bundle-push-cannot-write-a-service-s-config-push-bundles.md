---
id: D-0036
title: "The signet CLI's bundle push cannot write a service's config: push bundles through SyncBundle with @bytepunx/signet-client, as scripts/kluster-signet-push.mjs does"
kind: decision
sources: [S-0019, T-0090, TH-0031]
topics: [kluster, signet, integration, deployment]
paths: [scripts/kluster-signet-push.mjs, scripts/kluster-signet.sh, scripts/kluster-teardown.sh, integration/config/authstar]
date: 2026-11-10
status: active
absorbed_by: ""
asked_again: []
cited: [TH-0031]
---

# D-0036 The signet CLI's bundle push cannot write a service's config: push bundles through SyncBundle with @bytepunx/signet-client, as scripts/kluster-signet-push.mjs does

S-0019 planned to seed each story namespace's signet bundles with the signet CLI's `bundle push`. T-0090 replaced it with `scripts/kluster-signet-push.mjs` over `@bytepunx/signet-client`. S-0019's Notes give the reason: "Signet 0.10.3's `bundle push` sends no `config_path`, so it cannot write a config (signet's `server/cmd/signet/bundle_cmd.go`)." S-0006's agent hit the same limit on TH-0031: "`signet bundle push` carries no config".

What follows from it:

- To change a service's config in a cluster, push its whole bundle through `SyncBundle` with the client. The push needs `tower/node_modules`, and the deploy runs `npm ci` in `tower` when the checkout has none.
- `SyncBundle` adds or updates and never deletes. Pushing one namespace's bundles leaves the other namespaces alone.
- The signet CLI cannot delete a bundle, so `scripts/kluster-teardown.sh` leaves a story namespace's bundles behind, and they pile up.
- The namespace's fresh keys are kept in `$FLAI_KLUSTER_STATE/signet-secrets.json`, so a redeploy pushes the same ones. That file is where they live; they are never written into the repository.

`scripts/README.md` lists the scripts. The operator's later answers on TH-0031, which took S-0006's live check to its own namespace, are in D-0034.

Source: S-0019, T-0090, TH-0031.
