---
id: TH-0031
title: "S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main"
anchor:
  path: wip/kanban/stories/S-0006-serve-get-authstar-me-subscription-for-the-subscription-status-widget.md
  item: S-0006
status: answered
participants: [agent-S-0006, bytepunx]
created: 2026-11-09T07:16:28Z
updated: 2026-11-10T05:11:00Z
---

# TH-0031 S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main

On wip/kanban/stories/S-0006-serve-get-authstar-me-subscription-for-the-subscription-status-widget.md.

## Entries

### 2026-11-09T07:16:28Z agent-S-0006
I ran the golden path on the running `authstar-integration` cluster, with keep, portcullis, and web built from story/S-0006 (tag `s-0006`, now rolled back to the `s-0901` images I found). Step 4b reached portcullis's new forward and got **503 "billing unavailable"**. The harness's `integration/config/authstar/portcullis.yaml` never had `keepUpstream`, so portcullis forwards nothing to keep there, neither this route nor the Stripe webhooks. T-0095 adds it on the branch. To reach the cluster, though, signet has to sync it, and signet reads config only from `git@github.com:bytepunx/authstar-integration.git` on `main` (provision.sh). That is the old repo D-0001 retires, and `signet bundle push` carries no config. (I-0014 records this.) Two unrelated things on that cluster also fail: tower and herald refuse the script's operator token, and tower says tenant self-service provisioning is disabled. The provisioned state doesn't match `lib-secrets.sh`.

How should criterion 3 be verified?

1. **Recommended:** you allow me to push the one `keepUpstream` change to `bytepunx/authstar-integration` `main` and run `signet repo sync` on the cluster. I then roll out the `s-0006` images again, re-run step 4b, and tick criterion 3 on its PASS. The tower and herald failures stay out of scope.
2. S-0006 waits for E-0005: I add S-0019 to its `after`, block it, and run step 4b on the cluster S-0019's scripts bring up.
3. Criterion 3 stays unticked, with this evidence in the notes: the request reached portcullis's forward on a live stack and failed only on the missing config. S-0006 goes to review.

### 2026-11-09T07:18:44Z agent-S-0006
One more thing, whichever option you pick: S-0006's close-out at 97617c3 stops at the test tier for the reason S-0008 raised on TH-0030. On npm 12.2.2, `make install` blocks farmhash's install script, so all 11 of herald's behaviour spec files fail with "Cannot find module './build/Debug/farmhash.node'". S-0006 changes nothing in herald; the tier runs every project's suite (I-0010). Rebase, sync, narrative, and check passed. Once TH-0030 is answered, I'll re-run the close-out the same way.

### 2026-11-09T20:48:45Z bytepunx
the farmhash issue should be corrected now. let's go with your recommendation.

### 2026-11-09T20:54:19Z agent-S-0006
Thanks. I need to correct what my question assumed, and ask again.

I pushed `keepUpstream` to `bytepunx/authstar-integration` main (9de9df2). Then `signet repo list` on the `authstar-integration` cluster showed **no repository registered**, so nothing syncs from that repo and the push can't reach the cluster. That was my mistake: I went by provision.sh and didn't check the cluster first. Its bundle, and the `s-0901` images, came from some path this project doesn't record, most likely `signet bundle push`. The only way to change one field there is to push a whole bundle, and this checkout can't re-encrypt its secrets for that cluster's key. That would risk breaking a cluster other work depends on, so I haven't done it. (I-0014 has the detail.) The push to the old repo is harmless and can stay or be reverted.

How do you want criterion 3 verified now?

1. **Recommended:** wait for S-0019. I add S-0019 to S-0006's `after`, block S-0006 on it, and run step 4b on the cluster its kluster build and deploy scripts bring up from the monorepo. That's the route E-0005 sets out for exactly this.
2. Bring up a separate cluster of my own (for example `authstar-s0006`) with `integration/scripts`: up, provision, deploy-local, golden path, down. This does more outside the repo: provision.sh pushes `.sops.yaml` and secrets re-encrypted for the new cluster's key to `bytepunx/authstar-integration` main, and adds a GitHub deploy key. It also needs the cluster name made configurable in `lib.sh`.
3. Leave criterion 3 unticked, with the 503 evidence in the notes, and send S-0006 to review.

Meanwhile the close-out is past farmhash. It last stopped on steward's e2e because S-0007's run held port 4611 (I-0010), and I'm re-running it.

### 2026-11-10T02:37:06Z bytepunx
Take the recommendation, now that the deploy is complete

### 2026-11-10T02:46:14Z agent-S-0006
Thanks. To verify criterion 3 I need S-0006 deployed into its own namespace: **please run `flai kluster deploy S-0006` from your shell.** flai guard refuses that command to agents (D-0026).

Why main's deploy doesn't cover it: `flai kluster deployments` lists only main at 78a056a in `authstar`. Main has neither S-0006's keep route and portcullis forward nor T-0095's `keepUpstream`, so step 4b there would still answer 503. A deploy of S-0006 seeds portcullis's bundle from the branch's `integration/config/authstar/portcullis.yaml` (scripts/kluster-signet-push.mjs, D-0036), so the setting is included.

T-0132 (bb1c2f1) makes the golden path run against a story namespace. `KLUSTER_NAMESPACE` picks the namespace, the database prefix follows it (`s0006_`), and `KLUSTER_TOKENS` reads the operator tokens the deploy kept. Once you reply that the deploy passed, I'll run:

```sh
KUBECONFIG=.flai-cache/kluster/kubeconfig KLUSTER_NAMESPACE=s-0006 \
  KLUSTER_TOKENS=.flai-cache/kluster/state/s-0006/tokens.env \
  integration/scripts/scenario-golden-path.sh
```

That uses the k3d kubeconfig flai keeps, never the host's default context, which D-0026 is about. I'll tick criterion 3 if step 4b passes, then move S-0006 to review. If you'd rather run the scenario yourself, reply with step 4b's line and I'll tick from that.

### 2026-11-10T03:23:19Z agent-S-0006
Thanks for the deploy. I ran the golden path against `s-0006` (deploy bb1c2f1) with flai's k3d kubeconfig. Steps 1 to 4 pass: tenant provisioning, Dex login, tower account, and keep webhook. Step 6 behaves as expected. **Step 4b now gets through portcullis to keep, and keep answers 403 `{"error":"forbidden"}`** (keep's log: `GET /me/subscription` → 403).

The reason is the same gap S-0009 hit (I-0007, D-0019), not S-0006's code. Keep verifies the internal JWT with `perTenantJwksKeyProvider`, which fetches `https://authstar.<domain>/.well-known/jwks.json` using the domain tower reports for the tenant. The harness can't serve that in-cluster, and step 1 creates `acme` without a domain. With no verified claims, keep's `/me` route returns its generic 403. S-0017 is the story that fixes this harness gap; its plan is on TH-0035. (Step 5's herald decryption failure is the long-standing signet key issue and unrelated.) I recorded keep as a second consumer on I-0007.

How should S-0006 finish?

1. **Recommended (your precedent on TH-0021, D-0019):** move criterion 3's "real status" proof to S-0017. It can add "step 4b reads a real status through portcullis" to its criteria, and its harness fix serves the JWKS keep needs too. S-0006 goes to review now, with criterion 3 unticked and this run in the notes: the forward works on a live stack up to keep's JWT check. The close-out passed at bb1c2f1.
2. S-0006 waits for S-0017: I add S-0017 to `after`, block S-0006, and re-run step 4b once S-0017 is done. S-0006 holds an in-progress slot until then, and the limit is full at 4 of 4.
3. S-0006 goes to review with criterion 3 unticked, and nothing moves to S-0017.

### 2026-11-10T05:11:00Z bytepunx
S-0019 is
