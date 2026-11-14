---
id: D-0034
title: "S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main: the farmhash issue should be corrected now. let's go with your…"
kind: answer
sources: [TH-0031, S-0006]
topics: [integration, signet, kluster, keep, portcullis, all]
paths: [integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: [S-0017, TH-0035, TH-0049]
---

# D-0034 S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main: the farmhash issue should be corrected now. let's go with your…

Nothing syncs config into the running `authstar-integration` cluster from `bytepunx/authstar-integration`: its signet has no repository registered. A config change pushed to that repository's `main` never reaches the cluster. A story's live check runs instead on the story's own kluster namespace, which the operator deploys.

S-0006's agent asked on TH-0031 how to verify its criterion 3. The golden path's step 4b got 503 "billing unavailable" because the harness's `integration/config/authstar/portcullis.yaml` had no `keepUpstream`. The agent recommended pushing that one change to `bytepunx/authstar-integration` `main` and running `signet repo sync`. The operator, bytepunx, answered at 2026-11-09T20:48:45Z: "the farmhash issue should be corrected now. let's go with your recommendation."

The agent pushed the change (9de9df2). It then reported at 20:54:19Z: "`signet repo list` on the `authstar-integration` cluster showed **no repository registered**, so nothing syncs from that repo and the push can't reach the cluster." The cluster's bundle and its `s-0901` images came by a path the project does not record. The agent left that cluster alone and recommended waiting for S-0019's kluster scripts.

The operator answered at 2026-11-10T02:37:06Z: "Take the recommendation, now that the deploy is complete". So the route is S-0019's: the story is deployed into its own namespace with `flai kluster deploy S-0006`, which the operator runs, since flai guard refuses it to agents (D-0026). The deploy seeds portcullis's bundle from the branch's own `integration/config/authstar/portcullis.yaml` (D-0036), so a branch's config change does reach its namespace. The golden path then runs against it with `KLUSTER_NAMESPACE`, `KLUSTER_TOKENS`, and flai's k3d kubeconfig (T-0132).

On `s-0006`, step 4b got through portcullis to keep, and keep answered 403: the harness cannot serve the tenant's JWKS in-cluster (I-0007, D-0019), a gap S-0017 fixes. The agent recommended moving criterion 3's proof to S-0017. The operator's last answer, at 2026-11-10T05:11:00Z, reads only "S-0019 is"; S-0006 had gone to review at 03:11:14Z with criterion 3 unticked.

So check `signet repo list` before relying on a repository sync, and verify a story's live criterion on its own namespace. D-0001 covers where signet's source moves after the monorepo move.

Source: TH-0031, S-0006.
