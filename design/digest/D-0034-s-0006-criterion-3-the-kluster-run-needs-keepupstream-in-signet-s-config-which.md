---
id: D-0034
title: "S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main: the farmhash issue should be corrected now. let's go with your…"
kind: answer
sources: [TH-0031]
topics: [integration, signet, kluster, keep, portcullis, all]
paths: [integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: [S-0017, TH-0035]
---

# D-0034 S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main: the farmhash issue should be corrected now. let's go with your…

Nothing syncs config into the running `authstar-integration` cluster from `bytepunx/authstar-integration`: its signet has no repository registered. A config change pushed to that repository's `main` never reaches the cluster.

S-0006's agent asked on TH-0031 how to verify its criterion 3. The golden path's step 4b got 503 "billing unavailable" because the harness's `integration/config/authstar/portcullis.yaml` had no `keepUpstream`. The agent recommended pushing that one change to `bytepunx/authstar-integration` `main` and running `signet repo sync`. The operator, bytepunx, answered at 2026-11-09T20:48:45Z: "the farmhash issue should be corrected now. let's go with your recommendation."

The agent pushed the change (9de9df2). It then reported at 20:54:19Z: "`signet repo list` on the `authstar-integration` cluster showed **no repository registered**, so nothing syncs from that repo and the push can't reach the cluster." The cluster's bundle and its `s-0901` images came by a path the project does not record. The only way to change one field is to push a whole bundle, and the checkout cannot re-encrypt the secrets for that cluster's key. The agent left that cluster alone and asked again. Its recommendation was to wait for S-0019's kluster scripts.

So check `signet repo list` before relying on a repository sync. D-0036 says how a whole bundle is pushed. D-0001 covers where signet's source moves after the monorepo move.

Source: TH-0031.
