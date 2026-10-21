---
id: S-0001
type: story
nature: improvement
title: Land the scaffolding, fold the design records in, and import integration
status: review
parent: E-0001
owner: alex
created: 2026-10-21T04:58:53Z
updated: 2026-10-21T05:11:28Z
transitions:
  - to: ready
    at: 2026-10-21T04:58:53Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:05:27Z
    by: claude
  - to: review
    at: 2026-10-21T05:11:28Z
    by: claude
tags: []
---
# S-0001 Land the scaffolding, fold the design records in, and import integration

## Goal

The repository is a single, checkable monorepo: the system-flow scaffolding is committed, the original ADRs and stories live inside the system-flow layout with valid front matter, `design/system/overview.md` is a true map of the system, `integration` is imported with its history, the template version is locked, and a private remote exists.

## Acceptance criteria
- [x] `git status` is clean on `main` and a fresh clone passes `flai check --strict`
- [x] `design/adrs/` holds every ADR from the original repository (0001 to 0105; 0096 never existed) with front matter, and `design/decisions/` is gone; every link into them still resolves
- [x] Every file under `design/stories/` and `design/tech/` has `title`, `updated`, and `status` front matter
- [x] `design/system/overview.md` names every component, what it does, and links to the ADRs and stories that govern it
- [x] `integration/` is imported with its full history and listed in `system-flow.yaml` and `design/system/overview.md`
- [x] `system-flow.lock.yaml` records the applied template version
- [x] A private `bytepunx/authstar` remote exists and `main` is pushed to it

## Tasks
- T-0001 Import authstar-integration with its history into integration/
- T-0002 Register integration in the manifest, overview, and contributor docs
- T-0003 Verify a fresh clone passes the strict check

## Notes

The remote is created private because every `bytepunx/authstar-*` repository is private. Pushing the per-component Docker images and the npm packages is out of scope here; see S-0002 and its notes.
