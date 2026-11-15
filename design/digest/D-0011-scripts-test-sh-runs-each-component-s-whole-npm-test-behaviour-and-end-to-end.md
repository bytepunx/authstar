---
id: D-0011
title: scripts/test.sh runs each component's whole npm test, behaviour and end-to-end tiers both
kind: decision
sources: [S-0002, TH-0009, S-0011, S-0018]
topics: [testing, tooling, web]
paths: [scripts/test.sh, Makefile, system-flow.yaml]
date: 2026-11-06
status: absorbed
absorbed_by: "docs/contributors/index.md#running-the-tests"
asked_again: []
cited: [S-0022, T-0118, TH-0038]
---

# D-0011 scripts/test.sh runs each component's whole npm test, behaviour and end-to-end tiers both

S-0002 wired the root `make test` to the components and recorded in its narrative's Decisions: "`scripts/test.sh` runs each project's whole `npm test` (behavior and e2e) because that is what the old CI ran and the e2e tiers need nothing external."

The operator merged `story/S-0002` into `main` on 2026-11-06 (5263a88, TH-0009), so this is the `scripts/test.sh` on `main`. It runs each Node project's `npm test`, then portcullis's `cargo test` and clippy. It refuses a project with no `node_modules` (run `make install`). D-0017 says how a story tests through it.

Since S-0018 (accepted 2026-11-15), `scripts/test.sh` takes project names and runs only those, and every project when given none, as `make test` calls it. The manifest's per-project tiers call it with one project each, so `flai test` and the close-out run only the projects a change touches (D-0051). Before S-0018 it ran all of them whatever paths a story changed (I-0010, now closed).

Exception: web's `npm test` leaves out `test:e2e`, so web's Playwright specs run in no tier (S-0011, D-0030).

Source: S-0002, TH-0009, S-0011, S-0018.
