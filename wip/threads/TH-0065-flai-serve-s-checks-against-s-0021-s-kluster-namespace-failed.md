---
id: TH-0065
title: flai serve's checks against S-0021's kluster namespace failed
anchor:
  path: wip/kanban/stories/S-0021-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md
  item: S-0021
status: resolved
participants: [flai serve, agent-S-0021, bytepunx, alex]
created: 2026-11-14T18:02:17Z
updated: 2026-11-15T19:37:31Z
---

# TH-0065 flai serve's checks against S-0021's kluster namespace failed

On wip/kanban/stories/S-0021-npm-12-blocks-install-scripts-so-make-install-leaves-farmhash-unbuilt-and.md.

## Entries

### 2026-11-14T18:02:17Z flai serve
flai serve's checks of S-0021 against its namespace `s-0021` at 7b19fc1ce549a235cdd5f4bc39946a844506dff5 ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0021-20261114T180143Z.log`.

flai serve sent S-0021 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0021 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0021 tears the namespace down. flai checks status S-0021 shows the run.

### 2026-11-14T18:03:14Z agent-S-0021
The cause is outside S-0021. S-0021 changes no service: only `scripts/install.sh`, a new install check script, chart/hook's `allowScripts`, and docs.

In s-0021, tower handled golden-path step 1's tenant provisioning. Its signet bundle then changed, and it restarted itself ("signet bundle changed -- acquired restart lock, shutting down for Kubernetes to restart"). Step 2's login reached portcullis while tower was down. Portcullis logged `identity resolution failed ... request to tower failed: error sending request for url (https://tower.s-0021.svc.cluster.local:8080/identities/resolve)` and returned 500 at the callback. The golden path doesn't wait for tower between step 1 and step 2.

S-0022's and S-0014's checks failed at the same login step today. I recorded it as I-0035 (b98d7fb), with a likely fix: wait for tower's rollout or `/_ready` after step 1.

I'm moving S-0021 back to review at the new head, so flai serve deploys and checks it again. The race may pass this time, or fail the same way until I-0035 is fixed.

### 2026-11-14T18:10:58Z agent-S-0021
I need your decision. Three golden-path runs against s-0021 have failed, every time in the harness or the cluster's services, never in S-0021's change. S-0021 changes no service.

| Run | Login | Failed at | Cause |
|-----|-------|-----------|-------|
| 1, at 7b19fc1 | failed | login step 6 (500) | tower restarted after provisioning changed its signet bundle (I-0035, same as S-0014's I-0030) |
| 2, redeploy at b98d7fb | failed | login step 6 (500) | same race; tower then crash-looped on `ECONNREFUSED` to the shared Postgres (`postgres` namespace) for about 2 minutes |
| 3, checks rerun without redeploy | **passed** | herald send-and-verify (`oaep decoding error`); chronicle report through portcullis (403 `analytics:read`) | tower booted with its ephemeral herald key before herald's rotation reached signet. Chronicle's step runs inside tower's restart window (S-0014's I-0031). |

S-0014 hit the same sequence on TH-0061 and is waiting on you too. The close-out's kluster step can't pass at S-0021's head until a checks run passes, so I can't move S-0021 to review on my own.

**Options:**
1. **Recommended:** accept S-0021 with these kluster checks failing. The causes are the golden path's waits after signet changes (I-0030/I-0035) and tower's restart window (I-0031). S-0021's change is covered by its own close-out tiers, which passed at 7b19fc1 (b98d7fb and 3c8f870 add only issue documents).
2. Tear down s-0021 and redeploy it fresh. Herald's key would then reach signet on a clean run, but the race and the restart window can still fail it.
3. Hold S-0021 until a harness story makes the golden path wait for tower after each signet change.

Tell me which. I'll move S-0021 to review for 1, or ask for a fresh deploy for 2, or block it for 3.

### 2026-11-15T19:32:51Z bytepunx
1

### 2026-11-15T19:33:22Z agent-S-0021
Done as answered (option 1). S-0021 was synced onto main, and its close-out passed at c4cd05d. S-0021's Notes record that its kluster checks fail on I-0030/I-0035 and I-0031, not on its change. It is moving to review now. flai serve will deploy it again at c4cd05d, and that run's checks may fail the same way until the harness waits for tower after each signet change.

### 2026-11-15T19:37:31Z alex
Resolved: S-0021 was accepted
