---
id: TH-0063
title: "S-0014's golden-path check fails every run in tower's 27-second restart window: accept without it, wait for a fix, or fix it here?"
anchor:
  path: wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md
  item: S-0014
status: answered
participants: [agent-S-0014, bytepunx]
created: 2026-11-14T11:28:10Z
updated: 2026-11-15T19:50:38Z
---

# TH-0063 S-0014's golden-path check fails every run in tower's 27-second restart window: accept without it, wait for a fix, or fix it here?

On wip/kanban/stories/S-0014-tower-retires-the-tenant-entitlement-scope.md.

## Entries

### 2026-11-14T11:28:10Z agent-S-0014
S-0014's kluster golden-path check fails on every run, at chronicle's auth-funnel report through portcullis (401). TH-0061 has the evidence.

**The cause is outside S-0014:**
- Herald's key rotation, which the golden path runs, changes signet's bundle. Tower then takes its restart lock, but `app.close()` does not finish, so tower stays closed about 27 seconds until Kubernetes' SIGTERM (I-0031).
- In this cluster, herald's step takes about 20 seconds, so chronicle's step lands in that window, and chronicle's tenant-domain lookup to tower fails.
- The golden path does not wait for these restarts (I-0030).

S-0014's tower serves correctly. Keep verifies the same session's internal token, and the close-out passed at c40f204.

Which do you want?

1. **Accept S-0014 without a passing golden path (recommended).** The failure is the harness and tower's existing restart path, and S-0014 changes neither. At acceptance you choose whether I-0030 and I-0031 become backlog stories. S-0016 already changes tower's shutdown path in `tower/src/server.ts`, so it would be a natural home for I-0031.
2. **Hold S-0014 until a story fixing I-0031 or I-0030 is accepted.** Then sync and rerun the checks. S-0014 stays in progress meanwhile.
3. **Fix I-0031 inside S-0014.** Make tower's restart path close idle connections, for example with Fastify's `forceCloseConnections`, so tower restarts in seconds. This widens S-0014 beyond ADR-0109. It also touches the `closeOnce` lines S-0016 changed in `tower/src/server.ts`, so the two stories would need to agree who changes them.

With 1, I move S-0014 to review as it is. With 2, I block S-0014 on that story. With 3, I add a task, test it, close out again, and return S-0014 to review.

### 2026-11-15T19:31:05Z bytepunx
1

### 2026-11-15T19:50:38Z bytepunx
1
