---
id: T-0104
type: task
nature: remediation
title: steward installs and passes its suites on SvelteKit 3, vite 8, and vitest 5
status: cancelled
parent: S-0020
owner: alex
created: 2026-11-09T08:18:30Z
updated: 2026-11-09T08:19:21Z
transitions:
  - to: ready
    at: 2026-11-09T08:18:54Z
    by: agent-S-0020
  - to: cancelled
    at: 2026-11-09T08:19:21Z
    by: agent-S-0020
stream: S-0020
tags: [steward, node, dependencies]
touches: [steward/package.json, steward/package-lock.json, steward/svelte.config.js, steward/vite.config.ts, steward/Dockerfile]
---
# T-0104 steward installs and passes its suites on SvelteKit 3, vite 8, and vitest 5

## Work

The worktree already carries main's audit bumps for steward: `@sveltejs/kit` `^3.1.1`, `@sveltejs/adapter-node` `^6.0.1`, `vite` `^8.3.6`, and `vitest` `^5.1.0`. `npm ci` fails with `ERESOLVE` because SvelteKit 3 needs `@sveltejs/vite-plugin-svelte` `^7`, and steward still pins `^4.0.0`. Raise it, and any other dependency the new peers require, regenerate `steward/package-lock.json` with npm 12, and `npm ci`.

SvelteKit 3 no longer reads `svelte.config.js` (`config_file_unsupported`): move its configuration into the `sveltekit(...)` plugin in `steward/vite.config.ts`, delete `steward/svelte.config.js`, and update `steward/Dockerfile`, which copies it. Keep the comment on why steward uses adapter-node. Then fix what `npm run check`, `npm run typecheck`, and `npm test` report, adding the files that fix touches. Keep `allowScripts` to what the build and the suites need.

It waits for no task: it changes only steward's files.

## Done when

- `npm ci` in steward succeeds under npm 12.
- `npm run check`, `npm run typecheck`, `npm run build`, and `npm test` (behavior, integration, and Playwright e2e) pass in steward.
- `npm audit` in steward reports no high or critical advisory.

## Notes
- 2026-11-09T08:19:21Z: moved to cancelled: duplicates the planner's task drafted at the same time; kept the planner's (TH-0033)
