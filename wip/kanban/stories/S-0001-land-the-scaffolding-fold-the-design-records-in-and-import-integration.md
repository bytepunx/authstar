---
id: S-0001
type: story
nature: improvement
title: Land the scaffolding, fold the design records in, and import integration
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
# S-0001 Land the scaffolding, fold the design records in, and import integration

## Goal

The repository is a single, checkable monorepo: the system-flow scaffolding is committed, the original ADRs and stories live inside the system-flow layout with valid front matter, `design/system/overview.md` is a true map of the system, `integration` is imported with its history, the template version is locked, and a private remote exists.

## Acceptance criteria
- [ ] `git status` is clean on `main` and a fresh clone passes `flai check --strict`
- [ ] `design/adrs/` holds ADRs 0001 to 0105 with front matter, and `design/decisions/` is gone; every link into them still resolves
- [ ] Every file under `design/stories/` and `design/tech/` has `title`, `updated`, and `status` front matter
- [ ] `design/system/overview.md` names every component, what it does, and links to the ADRs and stories that govern it
- [ ] `integration/` is imported with its full history and listed in `system-flow.yaml` and `design/system/overview.md`
- [ ] `system-flow.lock.yaml` records the applied template version
- [ ] A private `bytepunx/authstar` remote exists and `main` is pushed to it

## Tasks

## Notes

The remote is created private because every `bytepunx/authstar-*` repository is private. Pushing the per-component Docker images and the npm packages is out of scope here; see S-0002 and its notes.
