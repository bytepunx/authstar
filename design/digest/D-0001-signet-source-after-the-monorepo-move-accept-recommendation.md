---
id: D-0001
title: "Signet source after the monorepo move: accept recommendation"
kind: answer
sources: [TH-0001, S-0001]
topics: [all, integration, signet]
paths: [integration, integration/README.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0001 Signet source after the monorepo move: accept recommendation

Signet's SOPS secrets source moves from the old `authstar-integration` repository to the monorepo's `integration/` folder, and the old per-component repositories are archived along with that switch.

S-0001 folded `authstar-integration` into `bytepunx/authstar` as `integration/` and raised signet's registration as a thread rather than holding the story on it. TH-0001 asked, on `design/system/overview.md` § State on 2026-10-21: "Before the harness is next run, decide whether signet syncs the monorepo's integration/ subdirectory or the old repository stays the registered source. Recommendation: point signet at the monorepo and archive the old per-component repositories together."

The operator, bytepunx, answered at 2026-11-06T17:57:51Z: "accept recommendation". The switch and the archiving are the operator's actions on signet and GitHub (D-0006).

Source: TH-0001, S-0001.
