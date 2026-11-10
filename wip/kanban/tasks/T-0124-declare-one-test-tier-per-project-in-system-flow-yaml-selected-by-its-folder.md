---
id: T-0124
type: task
nature: improvement
title: Declare one test tier per project in system-flow.yaml, selected by its folder
status: backlog
parent: S-0018
owner: bytepunx
created: 2026-11-09T22:11:02Z
updated: 2026-11-09T22:11:02Z
transitions: []
stream: S-0018
tags: [testing]
touches: [system-flow.yaml]
after: [T-0120]
---
# T-0124 Declare one test tier per project in system-flow.yaml, selected by its folder

## Work

`system-flow.yaml` declares no `tests`, so `flai test` and the close-out run `scripts/test.sh` as their one tier for any path. Declare a `tests` list instead, with one tier per project that `scripts/test.sh` runs today: each npm project in `NODE_PROJECTS`, and portcullis. Select each tier by its project's folder, and run it as `scripts/test.sh <project>`. Changes to `scripts/test.sh` or `scripts/lib-projects.sh` should select every tier. Declare no `integration` or `smoke` tier: this story changes what the behaviour tier selects, not which tiers exist. Follow flai's schema for `tests`, and check it with `flai check --strict`.

This edits a manifest key beyond `name`, `description`, and `dashboard`. Do it only once the operator allows it on the plan's thread on S-0018, and follow their answer if it differs.

This task waits for T-0120, since each tier calls `scripts/test.sh` with a project name, which T-0120 adds.

## Done when

- `flai test chronicle/` runs the chronicle tier alone.
- `flai test steward/` runs the steward tier alone.
- `flai test scripts/test.sh` runs every tier.
- `flai check --strict` passes on the manifest.

## Notes
