---
id: I-0041
title: Kubernetes backs off a second clean restart-lock exit within minutes, so tower stays down about 10s longer
class: impression
status: open
count: 1
cost: 5m
first_reported: 2026-11-18T08:51:25Z
last_reported: 2026-11-18T08:51:25Z
updated: 2026-11-18T08:51:25Z
---

# I-0041 Kubernetes backs off a second clean restart-lock exit within minutes, so tower stays down about 10s longer

## Description
Kubernetes backs off a second clean restart-lock exit within minutes, so tower stays down about 10s longer

## Instances

### 2026-11-18T08:51:25Z
Story: S-0038.
On s-0038 at 56b429b, tower's restart path exited cleanly twice in a row, with exit 0 and reason `Completed`:
- once after step 1's tenant provisioning;
- again at 08:50:42Z, 2s after herald's key rotation changed its bundle at 08:50:40Z.

The kubelet treats any container exit as a restart and backs off. It logged `Back-off restarting failed container tower` at 08:50:47Z and started tower again only at 08:50:52Z, so tower was down about 12s. Herald exited once, at 08:50:42Z, and was listening again at 08:50:44Z, with no back-off.

The hang S-0038 fixed (I-0029) is gone. Kubernetes' CrashLoop back-off (10s, then doubling, reset after 10 minutes up) still adds downtime when a service restarts for several signet changes in quick succession, as the golden path does. S-0039's waits cover it in the harness. Not measured beyond this one run.

## Remediation
