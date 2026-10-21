---
id: TH-0001
title: Signet source after the monorepo move
anchor:
  path: design/system/overview.md
  heading: State on 2026-10-21
status: open
participants: [claude]
created: 2026-10-21T05:11:49Z
updated: 2026-10-21T05:11:49Z
---

# TH-0001 Signet source after the monorepo move

On design/system/overview.md § State on 2026-10-21.

## Entries

### 2026-10-21T05:11:49Z claude
The original authstar-integration repository was registered with signet as its SOPS secrets source. It now lives as integration/ inside bytepunx/authstar (S-0001) and the old repository no longer receives changes. Before the harness is next run, decide whether signet syncs the monorepo's integration/ subdirectory or the old repository stays the registered source. Recommendation: point signet at the monorepo and archive the old per-component repositories together.
