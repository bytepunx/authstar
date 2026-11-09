---
id: T-0099
type: task
nature: remediation
title: web builds and passes its suites on SvelteKit 3 and adapter-node 6
status: done
parent: S-0020
owner: bytepunx
created: 2026-11-09T08:09:38Z
updated: 2026-11-09T08:48:38Z
transitions:
  - to: ready
    at: 2026-11-09T08:19:29Z
    by: agent-S-0020
  - to: in-progress
    at: 2026-11-09T08:19:31Z
    by: agent-S-0020
  - to: done
    at: 2026-11-09T08:48:38Z
    by: agent-S-0020
stream: S-0020
tags: [web, sveltekit, dependencies]
touches: [web/package.json, web/package-lock.json, web/svelte.config.js, web/vite.config.ts, web/vitest.config.ts, web/vitest.components.config.ts, web/vite.widgets.config.ts, web/tsconfig.json, web/src/hooks.server.ts, web/src/lib/server/guard.ts, web/Dockerfile, web/src/lib/server/config.ts, web/src/routes/(hosted)/signup/+page.svelte, web/kit.config.ts, web/src/env.ts]
usage:
  source: log
  seconds: 1747
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 119
      output: 26163
      cache_read: 10357380
      cache_write: 334778
      cost: 4.435
---
# T-0099 web builds and passes its suites on SvelteKit 3 and adapter-node 6

## Work

Bring web to the versions the forced audit fix chose, if the branch does not carry them yet: `@sveltejs/kit` `^3.1.1` and `@sveltejs/adapter-node` `^6.0.1`; its vite 8, vitest 4, and vite-plugin-svelte 7 already meet kit 3's peers. Check `svelte` against kit 3's `^5.57.1` and `typescript` against its optional `^6`. Approve in `allowScripts` only the install scripts a build or suite needs. Regenerate `web/package-lock.json` with npm 12 and `npm ci`.

Then fix what the builds and suites report: the kit config in `web/svelte.config.js`, the three vite configs and two vitest configs, `web/tsconfig.json`, `web/src/hooks.server.ts`, and the `error`, `redirect`, and `fail` calls in `web/src/lib/server/guard.ts` and the routes, checking that no `try` swallows a thrown `error()` or `redirect()`. Name any route file it changes in the story's touches with `flai touches`.

It waits for no task: it changes only web's files. S-0011, in progress, changes web's routes too: sync before starting, and settle any conflict in the two stories' conversation.

## Done when

- `npm run build`, `npm run build:widgets`, and `npm run check` in web pass with no peer dependency warning from kit 3.
- `npm test` and `npm run test:integration` in web pass, including the component and Playwright end-to-end tiers.

## Notes
