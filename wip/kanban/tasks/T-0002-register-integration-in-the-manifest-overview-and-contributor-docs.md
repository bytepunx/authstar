---
id: T-0002
type: task
nature: improvement
title: Register integration in the manifest, overview, and contributor docs
status: done
parent: S-0001
owner: alex
created: 2026-10-21T05:07:30Z
updated: 2026-10-21T05:10:07Z
transitions:
  - to: ready
    at: 2026-10-21T05:09:00Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:09:00Z
    by: claude
  - to: done
    at: 2026-10-21T05:10:07Z
    by: claude
stream: S-0001
tags: []
touches: [system-flow.yaml, design/system/overview.md, docs/contributors/index.md]
---
# T-0002 Register integration in the manifest, overview, and contributor docs

## Work

Add `integration` to `system-flow.yaml` `projects`, confirm its row in `design/system/overview.md`, and tell contributors in `docs/contributors/index.md` where the design records, stories, work items, and the integration harness live.

## Done when

- `flai check --strict` passes with the manifest entry and the docs name every folder a contributor needs.

## Notes

The manifest's `kind` values seen so far are `node`, `rust`, and `sveltekit`; integration is shell and Kubernetes manifests, so the entry may need a kind the check accepts.
