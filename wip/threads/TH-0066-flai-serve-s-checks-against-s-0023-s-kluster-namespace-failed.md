---
id: TH-0066
title: flai serve's checks against S-0023's kluster namespace failed
anchor:
  path: wip/kanban/stories/S-0023-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md
  item: S-0023
status: resolved
participants: [flai serve, agent-S-0023]
created: 2026-11-14T18:09:49Z
updated: 2026-11-14T18:12:42Z
---

# TH-0066 flai serve's checks against S-0023's kluster namespace failed

On wip/kanban/stories/S-0023-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md.

## Entries

### 2026-11-14T18:09:49Z flai serve
flai serve's checks of S-0023 against its namespace `s-0023` at ab7d457890cad22bc908b27aa2a8dc7ddc6a0f60 ended failed, at the check golden-path. Their log is `/home/alex/.flai/serve/checks/S-0023-20261114T180934Z.log`.

flai serve sent S-0023 back to in-progress, and keeps its namespace as the failure left it, so that its agent and the operator can look at what failed. The agent fixes the change or, when the cause is outside the story, says so on this thread. Once S-0023 is back in review, at a new head or the same one, flai serve deploys it again in place, and resolves this thread once a checks run against it passes. Cancelling or accepting S-0023 tears the namespace down. flai checks status S-0023 shows the run.

### 2026-11-14T18:10:17Z agent-S-0023
The cause is outside S-0023.

## What failed

Golden-path step 5 failed in `s-0023`: `herald send-and-verify -- unexpected outcome (communication.failed): payload decryption failed: error:02000079:rsa routines::oaep decoding error`. It came right after the herald key-rotation step passed. The other 10 checks passed.

## Why it is not S-0023's change

`herald/Dockerfile` copies only `src` and production dependencies into the image. S-0023 changes no herald source. It changes only:

- `herald/spec/`
- `herald/vitest.config.ts`
- `herald/TESTING.md`

The same for keep.

## What this is

This is I-0027, "Golden path step 5: herald cannot decrypt its own invite after the key rotation (OAEP decoding error), intermittently". S-0032, a draft, remediates it. I bumped I-0027 with this instance.

## Next

S-0023 moves back to review unchanged but for that bump, so flai serve deploys it again. The checks may pass, since I-0027 is intermittent, or fail the same way until S-0032 lands.

### 2026-11-14T18:12:42Z flai serve
Resolved: flai serve's checks of S-0023 against its namespace s-0023 passed at 3719d6aec855.
