---
id: I-0017
title: Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e
class: defect
status: open
count: 1
cost: 10m
first_reported: 2026-11-09T07:17:15Z
last_reported: 2026-11-09T07:17:15Z
updated: 2026-11-09T09:04:34Z
---

# I-0017 Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e

## Description
Web's Playwright e2e specs run in no test tier, so flai test and the close-out never run web/e2e

## Instances

### 2026-11-09T07:17:15Z
Story: S-0011.
`scripts/test.sh` runs each project's `npm test`. Web's `npm test` is behavior, components, and integration, and leaves out `test:e2e`. Steward's includes it. No other script runs web's e2e, so S-0011's T-0035 spec and the e2e checks of T-0032 and T-0033 have to be run by hand with `npm run test:e2e` in `web`.

## Remediation

Story S-0022 remediates this issue, created from it at 2026-11-09T09:04:34Z.
