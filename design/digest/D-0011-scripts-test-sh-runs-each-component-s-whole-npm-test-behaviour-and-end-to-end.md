---
id: D-0011
title: scripts/test.sh runs each component's whole npm test, behaviour and end-to-end tiers both
kind: decision
sources: [S-0002, TH-0009, S-0011]
topics: [testing, tooling, web]
paths: [scripts/test.sh, Makefile]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0011 scripts/test.sh runs each component's whole npm test, behaviour and end-to-end tiers both

S-0002 wired the root `make test` to the components and recorded in its narrative's Decisions: "`scripts/test.sh` runs each project's whole `npm test` (behavior and e2e) because that is what the old CI ran and the e2e tiers need nothing external."

The operator merged `story/S-0002` into `main` on 2026-11-06 (5263a88, TH-0009), so this is the `scripts/test.sh` on `main`. It runs every Node project's `npm test`, then portcullis's `cargo test` and clippy. It refuses a project with no `node_modules` (run `make install`). It runs all of them whatever paths a story changed (I-0010). D-0017 says how a story tests through it.

Exception: web's `npm test` leaves out `test:e2e`, so web's Playwright specs run in no tier (S-0011, D-0030).

Source: S-0002, TH-0009, S-0011.
