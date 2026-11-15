---
id: T-0119
type: task
nature: remediation
title: Run the whole test tier with web's e2e in it, and close I-0017
status: done
parent: S-0022
owner: bytepunx
created: 2026-11-09T22:10:25Z
updated: 2026-11-14T11:25:16Z
transitions:
  - to: ready
    at: 2026-11-14T11:25:02Z
    by: agent-S-0022
  - to: in-progress
    at: 2026-11-14T11:25:02Z
    by: agent-S-0022
  - to: done
    at: 2026-11-14T11:25:16Z
    by: agent-S-0022
stream: S-0022
tags: [web]
touches: [design/issues/I-0017-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md, design/issues/summary.md]
after: [T-0117, T-0118]
usage:
  source: log
  seconds: 14
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 2
      output: 381
      cache_read: 243537
      cache_write: 4625
      cost: 0.0927
---
# T-0119 Run the whole test tier with web's e2e in it, and close I-0017

## Work

- Run `flai test --all` in the story's worktree and confirm from its output that web's e2e specs ran, after `scripts/check-e2e-tiers.sh` passed.
- Close the issue: `flai issue close I-0017 --reason "<what fixed it>"`, naming web's `npm test` now running `test:e2e`, the free ports, `scripts/check-e2e-tiers.sh`, and chromium in `make install` and CI. flai writes the issue and `design/issues/summary.md`.

Waits for T-0117 and T-0118: the full run needs chromium installed and web's e2e in its `npm test`.

## Done when

- `flai test --all` passes with web's e2e in its run.
- I-0017 is closed with its reason, and `design/issues/summary.md` lists it so.
- Both acceptance criteria of S-0022 are ticked.

## Notes

The digest entry D-0030 says to run web's e2e by hand. Once this lands it is stale: say so in the narrative's `## Decisions` for the curator.
