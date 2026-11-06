---
id: D-0008
title: "The integration test tier stays out of CI because it needs Docker on the runner; make integration runs it locally"
kind: decision
sources: [S-0002]
topics: [ci, testing]
paths: [".github/workflows", scripts/integration.sh, Makefile]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0008 The integration test tier stays out of CI because it needs Docker on the runner; make integration runs it locally

S-0002 recorded in its narrative's Decisions: "The integration test tier stays out of CI for now, as the old workflows chose, because it needs Docker on the runner; `make integration` runs it locally."

A story that wants integration tests in CI must first give the runner Docker; until then CI runs the behaviour and end-to-end tiers only. S-0002's CI is on `story/S-0002`, not yet on `main` (I-0004).
