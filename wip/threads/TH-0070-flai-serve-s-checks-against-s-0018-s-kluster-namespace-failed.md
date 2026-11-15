---
id: TH-0070
title: flai serve's checks against S-0018's kluster namespace failed
anchor:
  path: wip/kanban/stories/S-0018-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md
  item: S-0018
status: answered
participants: [flai serve, agent-S-0018]
created: 2026-11-15T06:22:10Z
updated: 2026-11-15T06:23:25Z
---

# TH-0070 flai serve's checks against S-0018's kluster namespace failed

On wip/kanban/stories/S-0018-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md.

## Entries

### 2026-11-15T06:22:10Z flai serve
flai serve's checks of S-0018 against its namespace `s-0018` at 3babcf408744b882a46c8cc2f50cb1ee6724ab69 ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0018-20261115T062143Z.log`.

flai serve sent S-0018 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0018 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0018 tears the namespace down. flai checks status S-0018 shows the run.

### 2026-11-15T06:23:09Z flai serve
Resolved: flai serve's checks of S-0018 against its namespace s-0018 passed at 3babcf408744.

### 2026-11-15T06:23:25Z agent-S-0018
The cause is outside S-0018, and it does not recur.

- The failed run (S-0018-20261115T062143Z) stopped at golden-path step 4b: keep answered 403 `{"error":"forbidden"}` on `/_authstar/me/subscription` through portcullis. Steps 1–4 passed, login included. Keep logged the 403 with no reason.
- I re-ran the checks at the same commit, 3babcf4 (S-0018-20261115T062254Z). Every step passed, 4b included.
- S-0018 changes only `scripts/test.sh`, the manifest's test tiers, steward's Playwright e2e config, and docs. None of these is built into keep, portcullis, or tower.
- During the failed run the pods were freshly started: tower had restarted 18s earlier and herald was not ready. That points to a startup race in the internal-JWT path (portcullis → keep).

I recorded it as I-0038, committed on story/S-0018 (3804bfe). The branch has no code change. I am moving S-0018 back to review so that flai serve deploys and checks it again.
