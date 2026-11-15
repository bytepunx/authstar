---
id: D-0054
title: "node-flakes 2.1.0 throws NTP clock skew detected on a backward wall-clock step; herald's and keep's specs keep Date.now monotonic with spec/lib/monotonic-clock.ts, tower's and lookout's do not"
kind: cause
sources: [S-0023, TH-0040, I-0018, I-0033, T-0126, T-0173]
topics: [testing, herald, keep, tower, node]
paths: [herald/spec/lib/monotonic-clock.ts, keep/spec/lib/monotonic-clock.ts, herald/vitest.config.ts, keep/vitest.config.ts, herald/TESTING.md]
date: 2026-11-15
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0054 node-flakes 2.1.0 throws NTP clock skew detected on a backward wall-clock step; herald's and keep's specs keep Date.now monotonic with spec/lib/monotonic-clock.ts, tower's and lookout's do not

An intermittent `NTP clock skew detected` in a herald or keep spec is a real backward step of the host's wall clock, not a faked clock: S-0023 found no `useFakeTimers`, `setSystemTime`, or `Date.now` stub in herald's specs. `node-flakes` 2.1.0 throws whenever `Date.now()` reads earlier than the last id its generator made. consequent 2.0.1 builds one generator per `initialize()`, calls it in `createId` and on every dispatch, and offers no way to inject a clock. The host's WSL2 time sync makes such steps likely (planner-S-0023 on TH-0040).

S-0023 (accepted 2026-11-15) fixed the test suites only:

- herald and keep each name `spec/lib/monotonic-clock.ts` as a vitest setup file in `vitest.config.ts`, which keeps `Date.now()` from stepping back. A spec using vitest's fake timers replaces `Date` outright and bypasses it.
- `spec/behavior/clock-skew.spec.ts` in each reproduces the throw. keep's calls a fresh node-flakes provider directly, its own id path `src/lib/ids.ts`.
- tower's and lookout's suites carry no guard. The planner's rule on TH-0040: leave a suite out until it flakes the same way, then give it the same setup file, as T-0173 did for keep after S-0021 bumped I-0018 with a keep instance.

The services themselves are still exposed in production: a backward step fails every command herald, keep, and tower handle until the clock catches up. That is I-0033, which S-0034 remediates. herald/TESTING.md § "A backward step of the host clock failed unrelated specs at random" records the finding.
