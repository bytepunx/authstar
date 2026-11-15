---
id: T-0125
type: task
nature: remediation
title: Document per-project tiers, reproduce I-0010's instance, and close I-0010
status: done
parent: S-0018
owner: bytepunx
created: 2026-11-09T22:11:09Z
updated: 2026-11-15T06:14:07Z
transitions:
  - to: ready
    at: 2026-11-15T06:11:47Z
    by: agent-S-0018
  - to: in-progress
    at: 2026-11-15T06:11:47Z
    by: agent-S-0018
  - to: done
    at: 2026-11-15T06:14:07Z
    by: agent-S-0018
stream: S-0018
tags: [testing]
touches: [docs/contributors/index.md, design/issues/I-0010-the-test-tier-runs-every-project-s-suite-whatever-the-paths-and-steward-s-e2e.md, design/issues/summary.md]
after: [T-0122, T-0124]
usage:
  source: log
  seconds: 140
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 23
      output: 3667
      cache_read: 2494939
      cache_write: 28872
      cost: 0.7972
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

Reproduction on 2026-11-15, at story/S-0018's 388c1cc plus this task's docs edit. A decoy server held 127.0.0.1:4610 for both runs, answering every request with 503. Port 4611 was held by S-0023's steward e2e server (`node build/index.js` from `.flai-cache/worktrees/S-0023/steward`, pid 169327), so the decoy's bind on 4611 failed with EADDRINUSE. `ss -ltnp` showed both ports held before and after the runs.

| Run | Tiers run | Result | Duration |
|-----|-----------|--------|----------|
| `flai test chronicle/src/server.ts` | chronicle only | passed | 6.3s |
| `flai test steward/playwright.config.ts` | steward only | passed | 28.1s |

Before S-0018, the same `flai test chronicle/` ran every project for 9m11s and failed in steward (I-0010's first instance). An earlier pair of runs through the MCP tool `test` also passed (chronicle 6.3s, steward 30.9s), but the decoy may have exited before them, so they are not counted here.
