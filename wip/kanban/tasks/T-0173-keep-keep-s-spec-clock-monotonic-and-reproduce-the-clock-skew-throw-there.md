---
id: T-0173
type: task
nature: remediation
title: Keep keep's spec clock monotonic and reproduce the clock-skew throw there
status: done
parent: S-0023
owner: alex
created: 2026-11-14T17:40:41Z
updated: 2026-11-14T17:49:38Z
transitions:
  - to: ready
    at: 2026-11-14T17:40:45Z
    by: agent-S-0023
  - to: in-progress
    at: 2026-11-14T17:40:45Z
    by: agent-S-0023
  - to: done
    at: 2026-11-14T17:49:38Z
    by: agent-S-0023
stream: S-0023
tags: [keep, testing]
touches: [keep/spec/lib/monotonic-clock.ts, keep/spec/behavior/clock-skew.spec.ts, keep/vitest.config.ts, keep/TESTING.md]
usage:
  source: log
  seconds: 533
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 8
      output: 1121
      cache_read: 1018987
      cache_write: 11763
      cost: 0.3185
---
# T-0173 Keep keep's spec clock monotonic and reproduce the clock-skew throw there

## Work

I-0018's second instance (S-0021, 2026-11-14) is a keep behavior spec that failed once with a 500. Keep makes its ids with `node-flakes` (`keep/src/lib/ids.ts`) and through consequent, so the same backward clock step throws there. Copy herald's guard from T-0126: a vitest setup file `keep/spec/lib/monotonic-clock.ts` named in `keep/vitest.config.ts`. Add `keep/spec/behavior/clock-skew.spec.ts`, which steps a raw clock back between two `generateId()` calls and expects the throw, then shows the guarded clock does not throw. Add a short entry to `keep/TESTING.md`. It waits for no task: T-0126 is done, and no other open task touches keep.

## Done when

- keep's vitest runs load the monotonic clock setup file.
- `keep/spec/behavior/clock-skew.spec.ts` reproduces the throw with a raw clock and passes with the guard.
- `keep/TESTING.md` says why the setup file exists.

## Notes

Added by S-0023's agent after S-0021 bumped I-0018 with a keep instance.
