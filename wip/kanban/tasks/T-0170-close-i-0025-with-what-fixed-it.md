---
id: T-0170
type: task
nature: remediation
title: Close I-0025 with what fixed it
status: backlog
parent: S-0029
owner: bytepunx
created: 2026-11-14T10:10:52Z
updated: 2026-11-14T10:10:52Z
transitions: []
stream: S-0029
tags: [tower]
touches: [design/issues/I-0025-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md, design/issues/summary.md]
after: [T-0151, T-0169]
---
# T-0170 Close I-0025 with what fixed it

## Work

This task waits for T-0151 and T-0169, because its reason names the ADR T-0151 writes and the live check T-0169 runs, which closes the last code task's outcome.

Run `flai issue close I-0025 --reason "<reason>"`. The reason says that tower no longer calls GetServiceConfig, prunes key generations from the record its tenant actor keeps, names the ADR, and names the golden-path step that rotated a key on a real signet with no prune failure. flai rewrites the issue and `design/issues/summary.md`; edit neither by hand.

## Done when

- I-0025's status is closed, with the reason above.
- `flai check --strict` passes.

## Notes
