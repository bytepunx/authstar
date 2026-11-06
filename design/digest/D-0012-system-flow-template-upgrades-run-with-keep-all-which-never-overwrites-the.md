---
id: D-0012
title: System-flow template upgrades run with --keep-all, which never overwrites the project's edits and needs no terminal
kind: decision
sources: [S-0003]
topics: [tooling, documentation]
paths: [system-flow.lock.yaml, system-flow.yaml]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0012 System-flow template upgrades run with --keep-all, which never overwrites the project's edits and needs no terminal

S-0003 upgraded the system-flow template from 1.0.16 to 1.1.22 and recorded in its narrative's Decisions: "`--keep-all`: there is no terminal, and it never overwrites the project's edits."

An agent runs without an interactive terminal, so it cannot answer the upgrade's per-file prompts; `--keep-all` keeps every file the project edited, and the agent then merges the template's text into the conflicted files by hand, as S-0003 did for `design/README.md` and `design/adrs/README.md`.
