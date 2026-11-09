---
title: vitest
updated: 2026-11-09
status: active
topics: [node, sveltekit]
---

# vitest

vitest is the test runner for every Node service and both SvelteKit apps: the behaviour, e2e, and integration tiers each project's `npm test` and `npm run test:integration` run.

## Versions

| Project | `vitest` | `@vitest/coverage-v8` |
|---------|----------|------------------------|
| chronicle | ^5.1.0 | ^5.1.0 |
| herald | ^5.1.0 | ^5.1.0 |
| keep | ^5.1.0 | ^5.1.0 |
| lookout | ^5.1.0 | ^5.1.0 |
| tower | ^5.1.0 | ^5.1.0 |
| web | ^5.1.0 | ^5.1.0 |
| steward | ^5.1.0 | none |
| chart/hook | ^2.0.0 | none |

The services were on vitest 3, web on 4, and steward on 2. S-0020 moved all of them to 5, after a forced `npm audit fix`; for web that also cleared moderate `@vitest/mocker` advisories. No spec or service config needed a change for vitest 5. web and steward run it through the `sveltekit(...)` plugin ([sveltekit.md](sveltekit.md)). chart/hook was not part of the audit fix and stays on vitest 2.

The TypeScript client libraries in `clients/typescript` do not use vitest: they test with `node --test`.

## Why

vitest matches `consequent`'s and `consequent-postgres`'s own choice: both use it, so authstar's services did not introduce a separate convention. It is also the standard runner for SvelteKit apps, paired there with Playwright for end to end.
