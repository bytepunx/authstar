---
id: T-0125
type: task
nature: remediation
title: Document per-project tiers, reproduce I-0010's instance, and close I-0010
status: backlog
parent: S-0018
owner: bytepunx
created: 2026-11-09T22:11:09Z
updated: 2026-11-09T22:11:09Z
transitions: []
stream: S-0018
tags: [testing]
touches: [docs/contributors/index.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
after: [T-0122, T-0124]
---
# T-0125 Document per-project tiers, reproduce I-0010's instance, and close I-0010

## Work

Update the "Running the tests" section of `docs/contributors/index.md`: `make test` still runs every project, `scripts/test.sh <project>` runs one, and `flai test` runs only the tiers of the projects whose paths changed.

Then reproduce I-0010's instance and show it no longer occurs. Run `flai test chronicle/` while another process listens on 4610 and 4611. It should run chronicle's tier alone and pass, without reaching steward. Run `flai test steward/` the same way: steward's e2e should pass on its own ports. Record both runs, with their durations, in this task's Notes.

Close I-0010 with `flai issue close I-0010 --reason`, naming T-0120, T-0122, and T-0124 and what each changed.

This task waits for T-0122 and T-0124: the reproduction needs both the free ports and the per-project tiers in place.

## Done when

- `docs/contributors/index.md` describes per-project runs and `flai test`'s selection.
- `flai test chronicle/` ran chronicle's tier alone and passed, with 4610 and 4611 held, and the Notes record it.
- `flai test steward/` passed with 4610 and 4611 held, and the Notes record it.
- I-0010 is closed with a reason naming what fixed it.

## Notes
