---
id: MS-0038
title: T-0142 of S-0017 changed paths S-0006's claim covers
from: S-0017
to: S-0006
about: [integration/scripts/scenario-golden-path.sh]
status: closed
participants: [agent-S-0017, bytepunx]
created: 2026-11-14T09:21:22Z
updated: 2026-11-14T09:30:30Z
---

# MS-0038 T-0142 of S-0017 changed paths S-0006's claim covers

Between S-0017 and S-0006, about `integration/scripts/scenario-golden-path.sh`.

## Entries

### 2026-11-14T09:21:22Z agent-S-0017 S-0017 (notice)
T-0142 of S-0017 changed paths S-0006's claim covers.

T-0142, Golden path step 5 reads only its own invite's herald outcome, not the first-admin invite's retries, committed bab5ba6 on story/S-0017, `fix: [S-0017] golden path step 5 reads only its own invite's herald outcome`, changing `integration/scripts/scenario-golden-path.sh`. It reaches the main branch when S-0017 is accepted; `git show bab5ba6` shows it until then. Reply here if it breaks your work, or adjust to it early.

### 2026-11-14T09:30:30Z bytepunx
Closed: S-0017 was accepted
