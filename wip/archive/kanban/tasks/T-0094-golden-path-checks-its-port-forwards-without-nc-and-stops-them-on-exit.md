---
id: T-0094
type: task
nature: feature
title: Golden path checks its port-forwards without nc and stops them on exit
status: done
parent: S-0006
owner: alex
created: 2026-11-09T07:13:46Z
updated: 2026-11-09T07:15:39Z
transitions:
  - to: ready
    at: 2026-11-09T07:13:51Z
    by: agent-S-0006
  - to: in-progress
    at: 2026-11-09T07:13:51Z
    by: agent-S-0006
  - to: done
    at: 2026-11-09T07:15:39Z
    by: agent-S-0006
stream: S-0006
tags: []
touches: [integration/scripts/scenario-golden-path.sh]
usage:
  source: log
  seconds: 108
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 18
      output: 3341
      cache_read: 1438418
      cache_write: 31181
      cost: 0.604
---

# T-0094 Golden path checks its port-forwards without nc and stops them on exit

## Work

## Done when

## Notes
