---
id: T-0118
type: task
nature: remediation
title: Make web's npm test run its Playwright e2e, as steward's does
status: backlog
parent: S-0022
owner: bytepunx
created: 2026-11-09T22:10:18Z
updated: 2026-11-09T22:10:18Z
transitions: []
stream: S-0022
tags: [web]
touches: [web/package.json, web/TESTING.md]
after: [T-0115, T-0116]
---
# T-0118 Make web's npm test run its Playwright e2e, as steward's does

## Work

This is the fix. `scripts/test.sh` runs each project's whole `npm test`, behavior and e2e tiers both (D-0011), and web's alone leaves out `test:e2e` (D-0030).

- In `web/package.json`, make `test` run `test:behavior`, `test:components`, `test:integration`, then `test:e2e`, so `pretest:e2e` builds the widget bundle first. Keep `test:all` as an alias of `test`, or remove it and every mention of it.
- In `web/TESTING.md`, say that `npm test` runs all four tiers, that it needs chromium (`make install` installs it), and that each run picks free ports.

Waits for T-0115, so that the tier never runs web's e2e on fixed, reused ports. Waits for T-0116, so that its check is there to turn from failing to passing.

## Done when

- `npm test` in `web` runs the e2e specs under `web/e2e`, and they pass.
- `scripts/check-e2e-tiers.sh` exits 0.
- `flai test web/package.json` runs web's e2e and passes.

## Notes

Web's e2e runs a cold `npm run build` and `build:widgets`, so it adds minutes to every run of the test tier until S-0018 selects projects by path.
