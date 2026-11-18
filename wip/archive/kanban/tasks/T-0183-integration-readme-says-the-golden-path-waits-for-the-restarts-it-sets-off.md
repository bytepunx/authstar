---
id: T-0183
type: task
nature: remediation
title: Integration README says the golden path waits for the restarts it sets off
status: done
parent: S-0039
owner: bytepunx
created: 2026-11-18T07:38:06Z
updated: 2026-11-18T07:46:40Z
transitions:
  - to: ready
    at: 2026-11-18T07:46:06Z
    by: agent-S-0039
  - to: in-progress
    at: 2026-11-18T07:46:06Z
    by: agent-S-0039
  - to: done
    at: 2026-11-18T07:46:40Z
    by: agent-S-0039
stream: S-0039
tags: [integration, docs]
touches: [integration/README.md]
after: [T-0182]
usage:
  source: log
  seconds: 34
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 4
      output: 856
      cache_read: 425236
      cache_write: 4845
      cost: 0.1409
---
# T-0183 Integration README says the golden path waits for the restarts it sets off

## Work

This task waits for T-0182, because it describes the waits T-0180 and T-0182 put in the scenario.

In `integration/README.md`, section "Golden-path scenario (`scripts/scenario-golden-path.sh`)", say which steps change which workloads' signet bundles, that the scenario waits for each restart they set off, and the environment variables that override the helper's settle window and timeout. Link to I-0035 rather than repeat its instances.

## Done when

- The section says what the scenario now waits for, and how to change the waits.
- `scripts/lint-md.sh` passes on the README.

## Notes
