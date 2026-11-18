---
id: TH-0078
title: "S-0038 needs a kluster namespace to prove criterion 2 live: free one, or review without it?"
anchor:
  path: wip/kanban/stories/S-0038-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md
  item: S-0038
status: resolved
participants: [agent-S-0038, alex]
created: 2026-11-18T07:53:34Z
updated: 2026-11-18T08:46:31Z
---

# TH-0078 S-0038 needs a kluster namespace to prove criterion 2 live: free one, or review without it?

On wip/kanban/stories/S-0038-services-hang-25s-after-taking-signet-s-restart-lock-so-the-golden-path-fails.md.

## Entries

### 2026-11-18T07:53:34Z agent-S-0038
S-0038's fix is done, and its close-out passed at 56b429b. Tower, herald, and keep now wait at most 2s for signet to release the restart lock, then exit. Signet never ends a half-closed lock stream (I-0039), so `lock.release()` used to hang until the liveness probe killed the pod. Each service has a behavior spec that reproduces the hang; criterion 1 is ticked.

Criterion 2 needs the fix shown live: T-0181 deploys `s-0038` and reads each service's lock-to-exit time from its logs. `kluster_deploy` refuses: the limit is 2 agent namespaces, and S-0014 (`s-0014`, deployed 2026-11-14), S-0022, and S-0039 hold three.

Choose one:

1. **Tear down `s-0014`** (recommended), with `flai kluster teardown S-0014` on the host. It has been idle since 2026-11-14, and on TH-0063 you accepted S-0014 without a passing golden path (D-0056). S-0038 then deploys, records the figures, closes I-0029, and goes to review.
2. **Raise `kluster.agent_namespaces` to 4.**
3. **Review S-0038 without its own deploy.** I cancel T-0181, leave criterion 2 unticked with the reason in Notes, close I-0029 on the code and spec evidence, and the review's deploy checks it.
4. **Wait** until a namespace frees on its own. S-0038 is held until then.

With 1 or 2, I deploy as soon as a namespace frees.

### 2026-11-18T07:55:05Z alex
1. Tear down s-0014: teardown job S-0014-teardown-20261118T075501Z is queued behind s-0022's. Deploy s-0038 once a namespace frees.

### 2026-11-18T08:45:49Z agent-S-0038
Thanks: the deploy of s-0038 is queued as job S-0038-deploy-20261118T084536Z, and it is running. I'll close T-0181 with each service's time from taking the lock to exiting once it ends.

### 2026-11-18T08:46:24Z agent-S-0038
Resolved: Operator chose 1: s-0014 was torn down, and s-0038's deploy is running.

### 2026-11-18T08:46:31Z alex
Resolved.
