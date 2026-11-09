---
id: D-0030
title: "web's Playwright e2e specs run in no test tier: web's npm test leaves out test:e2e, so check web/e2e with npm run test:e2e by hand"
kind: decision
sources: [S-0011, I-0017]
topics: [testing, web, sveltekit, tooling]
paths: [web/package.json, web/e2e, scripts/test.sh, design/issues/I-0017-web-s-playwright-e2e-specs-run-in-no-test-tier-so-flai-test-and-the-close-out.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0030 web's Playwright e2e specs run in no test tier: web's npm test leaves out test:e2e, so check web/e2e with npm run test:e2e by hand

web's `npm test` runs `test:behavior`, `test:components`, and `test:integration`. It does not run `test:e2e`, which is `playwright test` after `build:widgets`. `scripts/test.sh` runs each project's `npm test`, so neither `flai test` nor the close-out runs `web/e2e`. That makes web an exception to D-0011.

S-0011 recorded this in its narrative's Decisions: "`web`'s `npm test` leaves out `test:e2e`, so neither `flai test` nor the close-out runs `web/e2e`." Its e2e Done-when lines, for T-0032, T-0033, and T-0035, were checked by running `npm run test:e2e` in `web` once, by hand. The narrative notes that this departs from `delegation.md`, because flai has no tier to run it through. The defect is I-0017.

Source: S-0011, I-0017.
