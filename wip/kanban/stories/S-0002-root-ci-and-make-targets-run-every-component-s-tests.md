---
id: S-0002
type: story
nature: improvement
title: Root CI and Make targets run every component's tests
status: review
parent: E-0001
owner: alex
created: 2026-10-21T04:58:53Z
updated: 2026-10-21T05:25:41Z
transitions:
  - to: ready
    at: 2026-10-21T04:58:53Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:14:09Z
    by: claude
  - to: review
    at: 2026-10-21T05:25:41Z
    by: claude
tags: []
---
# S-0002 Root CI and Make targets run every component's tests

## Goal

A push to `main` or a pull request runs every component's own test suite from the repository root, and `make test` does the same locally, so the orphaned per-component workflows can be removed.

## Acceptance criteria
- [x] `.github/workflows/ci.yml` runs each Node component's `npm test`, `portcullis`'s `cargo test` and `clippy`, `chart/hook`'s tests, and `clients/typescript`'s tests, with dependency caching
- [x] `scripts/test.sh` runs the same behavior suites locally and `make test` calls it; `make integration` runs the components' integration tiers
- [x] Docker image publishing for the eight services moves to a root workflow with per-component build contexts, gated on changes to that component
- [x] The per-component `.github/` folders are removed
- [x] `docs/contributors/index.md` says how to run the tests

## Tasks
- T-0004 Root CI workflow runs every component's tests
- T-0005 Make targets and scripts run the three test tiers locally
- T-0006 Image publishing moves to the root workflow and per-component workflows go
- T-0007 Contributor docs say how to run the tests

## Notes

The npm publish workflows for `clients/typescript` use npm Trusted Publishing bound to the `bytepunx/authstar-clients` repository and workflow file names. They cannot be moved without the operator re-registering the trusted publisher on npmjs.com, so publishing stays in the old repository until then; record the dependency as an open question.

Criterion 1 is verified by the workflow's content and by running the same commands locally (`make test`, 2026-10-21); GitHub refused to start any job because of the organization's billing (I-0003), so the workflow has not yet run in the cloud. Operator follow-ups: fix Actions billing; add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets; re-register the npm Trusted Publisher for both client packages against `bytepunx/authstar`; decide whether release-please returns or `flai release` cuts the client packages.
