---
id: D-0006
title: Archiving the old per-component authstar repositories and re-registering npm Trusted Publishing against bytepunx/authstar are the operator's actions
kind: decision
sources: [S-0001, S-0002]
topics: [all, release]
paths: [clients/typescript]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0006 Archiving the old per-component authstar repositories and re-registering npm Trusted Publishing against bytepunx/authstar are the operator's actions

S-0001 recorded in its narrative's Decisions: "The old per-component GitHub repositories, their CI, and the npm Trusted Publishing bound to `bytepunx/authstar-clients` are left untouched; archiving them and re-registering the publisher are operator actions, noted in S-0002."

S-0002 then ported the two npm publish workflows to the monorepo's root, with `clients/typescript` paths and the same file names, "so re-registering the npm Trusted Publisher against `bytepunx/authstar` is the only step left to publish from here." No story's agent archives the old repositories or changes the npm publisher.

The operator has since decided, on TH-0001, that signet's secrets source moves to the monorepo's `integration/` and the old repositories are archived together with that switch (D-0001). S-0002's workflows are on `story/S-0002`, not yet on `main` (I-0004).
