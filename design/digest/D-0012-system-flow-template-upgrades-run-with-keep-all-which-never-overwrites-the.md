---
id: D-0012
title: System-flow template upgrades run with --keep-all, which never overwrites the project's edits and needs no terminal
kind: decision
sources: [S-0003, S-0024]
topics: [tooling, documentation]
paths: [system-flow.lock.yaml, system-flow.yaml, design/system/README.md, wip/README.md]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: [S-0024, T-0121, TH-0037]
---

# D-0012 System-flow template upgrades run with --keep-all, which never overwrites the project's edits and needs no terminal

S-0003 upgraded the system-flow template from 1.0.16 to 1.1.22 and recorded in its narrative's Decisions: "`--keep-all`: there is no terminal, and it never overwrites the project's edits."

An agent runs without an interactive terminal, so it cannot answer the upgrade's per-file prompts; `--keep-all` keeps every file the project edited, and the agent then merges the template's text into the conflicted files by hand, as S-0003 did for `design/README.md` and `design/adrs/README.md`.

S-0024 upgraded from 1.1.22 to 1.1.24 the same way, keeping its 15 conflicts with `--keep-all`. The upgrade also rewrote template files the project never changed, such as `design/system/README.md` and `wip/README.md`, and merged the conventions' baselines. Its narrative's Decisions keep those rewrites: "reverting would make their hashes differ from the lock and turn them into conflicts at the next upgrade." So an upgrade's own rewrites of untouched template files stay in the commit, even when only their `updated` date moves.

Source: S-0003, S-0024.
