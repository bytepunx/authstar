---
id: T-0007
type: task
nature: improvement
title: Contributor docs say how to run the tests
status: done
parent: S-0002
owner: alex
created: 2026-10-21T05:15:37Z
updated: 2026-10-21T05:25:13Z
transitions:
  - to: ready
    at: 2026-10-21T05:25:12Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:25:12Z
    by: claude
  - to: done
    at: 2026-10-21T05:25:13Z
    by: claude
stream: S-0002
tags: []
touches: [docs/contributors/index.md]
---
# T-0007 Contributor docs say how to run the tests

## Work

Rewrite the testing section of `docs/contributors/index.md` around `make install`, `make test`, `make integration`, and `make smoke`.

## Done when

- The section matches what the scripts do and `flai check --strict` passes.

## Notes

The section currently says the targets are being wired.
