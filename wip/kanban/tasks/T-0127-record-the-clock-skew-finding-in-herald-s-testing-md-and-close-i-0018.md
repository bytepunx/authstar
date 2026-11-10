---
id: T-0127
type: task
nature: remediation
title: Record the clock-skew finding in herald's TESTING.md and close I-0018
status: backlog
parent: S-0023
owner: bytepunx
created: 2026-11-09T22:11:34Z
updated: 2026-11-09T22:11:34Z
transitions: []
stream: S-0023
tags: [herald, testing, docs]
touches: [herald/TESTING.md, design/issues/I-0018-herald-s-retention-purge-spec-fails-intermittently-with-ntp-clock-skew-detected.md, design/issues/summary.md]
after: [T-0126]
---
# T-0127 Record the clock-skew finding in herald's TESTING.md and close I-0018

## Work

Waits for T-0126: it records what T-0126's reproduction confirmed and the fix it landed, and I-0018 closes only once that fix is in.

1. Add a numbered finding to `herald/TESTING.md`, beside its other consequent gotchas: `node-flakes` throws `NTP clock skew detected` when the wall clock steps back between two ids of one generator; consequent offers no clock or id-generator injection; `herald/spec/lib/monotonic-clock.ts` keeps `Date.now()` monotonic for every herald spec run, and `herald/spec/behavior/clock-skew.spec.ts` proves it. Say that the service itself is still exposed to a backward step, and link the plan's thread on S-0023 for what was decided about it.
2. Close I-0018 with `flai issue close I-0018 --reason "<reason>"`, the reason naming the cause, the setup module, and the reproduction spec.

## Done when

- `herald/TESTING.md` carries the finding, and the markdown lint passes on it.
- `flai issue close` has closed I-0018 with a reason naming what fixed it, and `design/issues/summary.md` no longer lists it as open.
- `flai check --strict` is clean for S-0023.

## Notes
