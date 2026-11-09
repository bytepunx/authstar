---
id: T-0105
type: task
nature: remediation
title: web installs and passes its suites on SvelteKit 3
status: cancelled
parent: S-0020
owner: alex
created: 2026-11-09T08:18:34Z
updated: 2026-11-09T08:19:21Z
transitions:
  - to: ready
    at: 2026-11-09T08:18:55Z
    by: agent-S-0020
  - to: cancelled
    at: 2026-11-09T08:19:21Z
    by: agent-S-0020
stream: S-0020
tags: [web, node, dependencies]
touches: [web/package.json, web/package-lock.json, web/svelte.config.js, web/vite.config.ts, web/vitest.config.ts, web/Dockerfile]
---
# T-0105 web installs and passes its suites on SvelteKit 3

## Work

The worktree already carries main's audit bumps for web: `@sveltejs/kit` `^3.1.1` and `@sveltejs/adapter-node` `^6.0.1`. SvelteKit 3 no longer reads `svelte.config.js` (`config_file_unsupported`), so every suite fails at startup. Move its configuration, the adapter, the `$widgets` alias, and `paths.relative: false` with its comment, into the `sveltekit(...)` plugin call in `web/vite.config.ts` and `web/vitest.config.ts`, delete `web/svelte.config.js`, and update `web/Dockerfile`, which copies it. Bring any dependency whose peers no longer match up to the version SvelteKit 3 needs, regenerate `web/package-lock.json` with npm 12, `npm ci`, and fix what `npm run check`, `npm run typecheck`, `npm test`, and `npm run test:e2e` report, adding the files that fix touches. Keep `allowScripts` to what the build and the suites need.

It waits for no task: it changes only web's files.

## Done when

- `npm ci` in web succeeds under npm 12.
- `npm run check`, `npm run typecheck`, `npm run build:all`, `npm test`, and `npm run test:e2e` pass in web.
- `npm audit` in web reports no high or critical advisory.

## Notes
- 2026-11-09T08:19:21Z: moved to cancelled: duplicates the planner's task drafted at the same time; kept the planner's (TH-0033)
