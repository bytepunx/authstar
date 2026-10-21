---
id: T-0013
type: task
nature: feature
title: Golden path exercises the widget route against the running stack
status: done
parent: S-0006
owner: alex
created: 2026-10-21T05:33:53Z
updated: 2026-10-21T05:39:59Z
transitions:
  - to: ready
    at: 2026-10-21T05:39:18Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:39:18Z
    by: claude
  - to: done
    at: 2026-10-21T05:39:59Z
    by: claude
stream: S-0006
tags: []
touches: [integration]
---
# T-0013 Golden path exercises the widget route against the running stack

## Work

Add a step to `integration/scripts/scenario-golden-path.sh` that calls `/_authstar/me/subscription` through portcullis with the scripted login's session cookie and asserts the JSON shape.

## Done when

- The step is in the script and documented in `integration/README.md`; running it needs the k3d cluster, which this session cannot bring up, so the criterion stays unticked until someone runs it.

## Notes

Criterion 3 of the story depends on a live cluster.
