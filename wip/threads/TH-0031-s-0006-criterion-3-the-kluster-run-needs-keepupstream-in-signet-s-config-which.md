---
id: TH-0031
title: "S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main"
anchor:
  path: wip/kanban/stories/S-0006-serve-get-authstar-me-subscription-for-the-subscription-status-widget.md
  item: S-0006
status: open
participants: [agent-S-0006]
created: 2026-11-09T07:16:28Z
updated: 2026-11-09T07:18:44Z
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
