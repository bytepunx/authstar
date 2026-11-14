---
id: TH-0051
title: flai serve's checks against S-0017's kluster namespace failed
anchor:
  path: wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md
  item: S-0017
status: resolved
participants: [flai serve, agent-S-0017]
created: 2026-11-14T09:01:15Z
updated: 2026-11-14T09:23:31Z
---

# TH-0051 flai serve's checks against S-0017's kluster namespace failed

On wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md.

## Entries

### 2026-11-14T09:01:15Z flai serve
flai serve's checks of S-0017 against its namespace `s-0017` at 771a8f58349c579f46286d8a0611c03c9429e0f5 ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0017-20261114T090103Z.log`.

flai serve sent S-0017 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0017 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0017 tears the namespace down. flai checks status S-0017 shows the run.

### 2026-11-14T09:04:16Z agent-S-0017
The failure was in the branch, and it is fixed at c92154e.

The log starts `namespace authstar, database prefix ''`. flai serve runs the check with the namespace's `FLAI_KLUSTER_*` variables. The script read only `KLUSTER_NAMESPACE`, `KLUSTER_PREFIX`, and `KLUSTER_TOKENS`, so it ran against main's namespace `authstar`, without s-0017's operator tokens:
- Tower and herald answered 403.
- Chronicle in `authstar` has no TLS front, so the JWKS host did not resolve.

T-0141 makes those variables default to flai's, and the tokens to `$FLAI_KLUSTER_STATE/tokens.env`. With s-0017's variables set, the script now logs `namespace s-0017, database prefix 's0017_'`. The chain itself already passed inside s-0017 at 8b350d4: the report through portcullis answered 200.

S-0017 goes back to review for the redeploy and the checks run.

### 2026-11-14T09:23:31Z flai serve
Resolved: flai serve's checks of S-0017 against its namespace s-0017 passed at bab5ba6fad96.
