---
id: D-0011
title: scripts/test.sh runs each component's whole npm test, behaviour and end-to-end tiers both
kind: decision
sources: [S-0002]
topics: [testing, tooling]
paths: [scripts/test.sh, Makefile]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0011 scripts/test.sh runs each component's whole npm test, behaviour and end-to-end tiers both

S-0002 wired the root `make test` to the components and recorded in its narrative's Decisions: "`scripts/test.sh` runs each project's whole `npm test` (behavior and e2e) because that is what the old CI ran and the e2e tiers need nothing external."

On `main`, `scripts/test.sh` is still the template's stub: S-0002's version is on `story/S-0002`, never merged, and S-0003's template upgrade replaced the script (I-0004). TH-0009 asks the operator how S-0008 should run keep's and web's tests meanwhile.
