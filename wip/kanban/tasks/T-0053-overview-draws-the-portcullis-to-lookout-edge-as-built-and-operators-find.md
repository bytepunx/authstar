---
id: T-0053
type: task
nature: improvement
title: Overview draws the portcullis-to-lookout edge as built and operators find lookoutUpstream
status: done
parent: S-0010
owner: bytepunx
created: 2026-11-06T18:09:07Z
updated: 2026-11-10T05:52:37Z
transitions:
  - to: ready
    at: 2026-11-10T05:51:30Z
    by: agent-S-0010
  - to: in-progress
    at: 2026-11-10T05:51:30Z
    by: agent-S-0010
  - to: done
    at: 2026-11-10T05:52:37Z
    by: agent-S-0010
stream: S-0010
tags: [portcullis, docs]
touches: [design/system/overview.md, docs/operators/portcullis-configuration.md, docs/operators/index.md]
after: [T-0048, T-0050]
usage:
  source: log
  seconds: 67
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 21
      output: 7666
      cache_read: 1528689
      cache_write: 100030
      cost: 1.0163
---
# T-0053 Overview draws the portcullis-to-lookout edge as built and operators find lookoutUpstream

## Work

- In `design/system/overview.md`, make the `P -.->|analytics events| L` edge solid, remove the sentence saying it is designed but not implemented, and remove "portcullis does not emit to lookout" from the state section. Bump `updated`.
- Write `docs/operators/portcullis-configuration.md` with the `lookoutUpstream` bundle key: what it is, its shape, that it is optional, and that portcullis emits no analytics without it. Leave the other portcullis keys to a later page unless they are quick to list. Link it from `docs/operators/index.md`, in the settings index S-0009's T-0039 starts there.

Waits for T-0048 and T-0050, so the overview describes what is built.

## Done when

- `design/system/overview.md` no longer marks the edge as unbuilt, and `lookoutUpstream` is documented and linked from `docs/operators/index.md`.
- `flai check --strict` and the markdown lint pass.

## Notes

S-0009's T-0039 also changes `design/system/overview.md` and `docs/operators/index.md`; sync after S-0009 is accepted before this task.
