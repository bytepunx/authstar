---
id: D-0056
title: "S-0014's golden-path check fails every run in tower's 27-second restart window: accept without it, wait for a fix, or fix it here: 1"
kind: answer
sources: [TH-0063, TH-0061, S-0014, TH-0065, S-0021, TH-0064, S-0022]
topics: [kluster, testing, tower, integration, review, all]
paths: [integration/scripts/scenario-golden-path.sh, tower/src/server.ts, design/issues/I-0030-the-golden-path-logs-in-while-tower-s-signet-coordinated-restart-after.md, design/issues/I-0031-tower-stays-down-for-about-27-seconds-after-taking-its-signet-restart-lock-app.md, design/issues/I-0035-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0056 S-0014's golden-path check fails every run in tower's 27-second restart window: accept without it, wait for a fix, or fix it here: 1

The operator chose to accept S-0014 without a passing golden path, because the failure is in the harness and in tower's restart path on main, neither of which S-0014 changes. The operator gave the same answer for S-0021 (TH-0065) and S-0022 (TH-0064), whose golden paths failed in the same window.

S-0014's kluster golden-path check failed on every run (TH-0061). Its third run, and a checks rerun with no redeploy, failed only chronicle's auth-funnel report through portcullis with a 401. agent-S-0014 traced it: herald's key rotation changes signet's bundle; tower takes its restart lock, but `app.close()` does not finish, so tower stays closed about 27 seconds until Kubernetes' SIGTERM (I-0031). Herald's step took about 20 seconds in that cluster, so chronicle's tenant-domain lookup to tower landed in the window every time. The golden path does not wait for these restarts (I-0030). Keep verified the same session's internal token before the window, and the close-out passed at c40f204. I-0030 and I-0031 are recorded on `story/S-0014` and reach main with it.

TH-0063 offered three options: "1. Accept S-0014 without a passing golden path (recommended) ... 2. Hold S-0014 until a story fixing I-0031 or I-0030 is accepted ... 3. Fix I-0031 inside S-0014", the last widening the story beyond ADR-0109 and touching the `closeOnce` lines S-0016 changed in `tower/src/server.ts`. The operator, bytepunx, answered at 2026-11-15T19:31:05Z: "1". With it, the agent moves S-0014 to review as it is, and at acceptance the operator chooses whether I-0030 and I-0031 become backlog stories.

S-0021 and S-0022 changed no deployed service, only scripts, configuration, and docs. Their golden paths failed at the login: tower restarted after step 1's tenant provisioning changed its signet bundle, and portcullis's call to tower's `/identities/resolve` failed with a 500. agent-S-0021 recorded this as I-0035, with a likely fix: wait for tower's rollout or `/_ready` after step 1. S-0022's runs also hit I-0032, where the golden path exits with no fail line when a curl to tower cannot connect. Redeploys and checks reruns failed the same way. Both agents recommended "Accept ... without a passing golden path", as on TH-0063. The operator answered "1" on TH-0065 at 2026-11-15T19:32:51Z and on TH-0064 at 2026-11-15T19:33:12Z. S-0021 went to review with its Notes naming I-0030/I-0035 and I-0031, and was accepted.

Accepting past a failing kluster check is the operator's alone (D-0057). A story whose golden path fails only in tower's restart window, and which changes neither the harness nor the restart path, may ask for the same. It records the instance first, as D-0052 says, and shows from the pods' logs that the failure is tower being unreachable after a signet change. Until the golden path waits for tower after each signet change, more redeploys rarely help.

Source: TH-0063, TH-0061, S-0014, TH-0065, S-0021, TH-0064, S-0022.
