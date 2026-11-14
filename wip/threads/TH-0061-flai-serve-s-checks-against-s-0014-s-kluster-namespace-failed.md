---
id: TH-0061
title: flai serve's checks against S-0014's kluster namespace failed
anchor:
  path: wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md
  item: S-0014
status: answered
participants: [flai serve, agent-S-0014]
created: 2026-11-14T11:12:56Z
updated: 2026-11-14T11:28:03Z
---

# TH-0061 flai serve's checks against S-0014's kluster namespace failed

On wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md.

## Entries

### 2026-11-14T11:12:56Z flai serve
flai serve's checks of S-0014 against its namespace `s-0014` at 731afd4d345631ab521450497ced8d8c9124fcff ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0014-20261114T111232Z.log`.

flai serve sent S-0014 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0014 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0014 tears the namespace down. flai checks status S-0014 shows the run.

### 2026-11-14T11:14:38Z agent-S-0014
The cause is outside S-0014: a race in the golden-path harness, recorded as I-0030 on story/S-0014 (ff7bb98). S-0014's branch is unchanged.

**What happened in `s-0014`:**
- 11:12:40: tower provisioned acme.
- 11:12:49: tower logged `signet bundle changed -- acquired restart lock, shutting down for Kubernetes to restart`. This is the normal restart after provisioning (ADR-0009).
- 11:12:56: portcullis's callback could not reach `tower.s-0014.svc.cluster.local:8080/identities/resolve`, logged `identity resolution failed`, and returned 500.

`scenario-golden-path.sh` starts login straight after provisioning, without waiting for that restart. The first runs for S-0006, S-0013, S-0015, and S-0016 finished login 2 to 5 seconds after provisioning, before the restart. This run's Dex steps took 16 seconds, with three story namespaces running at once.

S-0014 does not change tower's restart, portcullis, or the login path. Tower restarted once and is now 1/1 ready with S-0014's code.

I am moving S-0014 back to review, so that flai serve deploys and checks it again.

### 2026-11-14T11:18:24Z flai serve
flai serve's checks of S-0014 against its namespace `s-0014` at ff7bb98675f2616548477dcd6318e6574d2d99d2 ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0014-20261114T111713Z.log`.

flai serve sent S-0014 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0014 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0014 tears the namespace down. flai checks status S-0014 shows the run.

### 2026-11-14T11:19:56Z agent-S-0014
The second run's failures are outside S-0014 too. I recorded them as a second instance of I-0030 (68d1887), and S-0014's code is unchanged.

**Login passed this time,** which confirms the first run's race. Two later steps failed.

**Herald send-and-verify** (`payload decryption failed: oaep decoding error`):
- The first run stopped at login, so herald's key rotation never ran, and signet had no herald key.
- In this run, tower booted with the ephemeral herald key and encrypted the invite with it.
- The rotation at 11:18:02 changed signet's bundle, and tower took its restart lock at 11:18:12, after the invite was already encrypted.
- Other stories' first runs reached the rotation, so their later runs found the key in signet.

**Chronicle auth-funnel report through portcullis** (401 `missing or invalid internal token`):
- It came 12 seconds after that tower restart.
- Provisioning answered 201 again, so the redeploy gave a fresh database while signet kept run 1's state.

This run took about 70 seconds, against about 10 for passing runs, so the restarts the golden path sets off land mid-run.

No service but tower reads `seatLimit`. S-0014 does not touch herald, chronicle, portcullis, the internal JWT, or tower's restart.

**Next:** I am moving S-0014 back to review. Signet now holds herald's key, so the next run should pass herald. If the next run fails the same way, I will block S-0014 and ask whether the I-0030 harness fix, making the golden path wait for tower after each signet change, should land first.

### 2026-11-14T11:22:56Z flai serve
flai serve's checks of S-0014 against its namespace `s-0014` at 68d18872fe05b7c79608a63cf7634b431b8c07fe ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0014-20261114T112219Z.log`.

flai serve sent S-0014 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0014 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0014 tears the namespace down. flai checks status S-0014 shows the run.

### 2026-11-14T11:28:03Z agent-S-0014
The third run, and a checks rerun I asked for with no redeploy, both fail only chronicle's auth-funnel report through portcullis (401). The cause is outside S-0014, and the failure now repeats on every run.

**What the rerun shows:**
- Herald's rotation at 11:24:10 changes signet's bundle. Tower takes its restart lock at 11:24:20, but stays closed until Kubernetes' SIGTERM at 11:24:47, and serves again at 11:24:49.
- Chronicle's report comes at 11:24:31, inside that window. Its `GET /tenants/acme` to tower never reaches tower's log, so chronicle has no domain to fetch the JWKS for and answers 401.
- Keep verified the same session's internal token at 11:24:08, before the window. Once tower is back, chronicle's pod gets `domain: acme.authstar.app` from tower.

Herald's send-and-verify takes about 20 seconds here, against about 1 in other stories' passing runs, so step 6 now lands in tower's window every time.

**Recorded:**
- I-0030, third instance (3dc6ad0).
- I-0031 (89bbade): tower's restart path does not exit after `app.close()`, so tower is down about 27 seconds after each signet change. That path is on main as it stands.

S-0014 changes neither. I am asking the operator on a thread on S-0014 how to proceed, since another redeploy is likely to fail the same way.
