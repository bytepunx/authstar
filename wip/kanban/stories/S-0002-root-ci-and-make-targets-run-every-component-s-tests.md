---
id: S-0002
type: story
nature: improvement
title: Root CI and Make targets run every component's tests
status: ready
parent: E-0001
owner: alex
created: 2026-10-21T04:58:53Z
updated: 2026-10-21T04:58:53Z
transitions:
  - to: ready
    at: 2026-10-21T04:58:53Z
    by: claude
tags: []
---
# S-0002 Root CI and Make targets run every component's tests

## Goal

A push to `main` or a pull request runs every component's own test suite from the repository root, and `make test` does the same locally, so the orphaned per-component workflows can be removed.

## Acceptance criteria
- [ ] `.github/workflows/ci.yml` runs each Node component's `npm test`, `portcullis`'s `cargo test` and `clippy`, `chart/hook`'s tests, and `clients/typescript`'s tests, with dependency caching
- [ ] `scripts/test.sh` runs the same behavior suites locally and `make test` calls it; `make integration` runs the components' integration tiers
- [ ] Docker image publishing for the eight services moves to a root workflow with per-component build contexts, gated on changes to that component
- [ ] The per-component `.github/` folders are removed
- [ ] `docs/contributors/index.md` says how to run the tests

## Tasks

## Notes

The npm publish workflows for `clients/typescript` use npm Trusted Publishing bound to the `bytepunx/authstar-clients` repository and workflow file names. They cannot be moved without the operator re-registering the trusted publisher on npmjs.com, so publishing stays in the old repository until then; record the dependency as an open question.
