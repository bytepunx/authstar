---
id: T-0098
type: task
nature: remediation
title: steward builds and passes its suites on SvelteKit 3, vite 8, and vite-plugin-svelte 7
status: done
parent: S-0020
owner: bytepunx
created: 2026-11-09T08:09:33Z
updated: 2026-11-09T08:48:35Z
transitions:
  - to: ready
    at: 2026-11-09T08:19:29Z
    by: agent-S-0020
  - to: in-progress
    at: 2026-11-09T08:19:30Z
    by: agent-S-0020
  - to: done
    at: 2026-11-09T08:48:35Z
    by: agent-S-0020
stream: S-0020
tags: [steward, sveltekit, dependencies]
touches: [steward/package.json, steward/package-lock.json, steward/svelte.config.js, steward/vite.config.ts, steward/tsconfig.json, steward/src/lib/server/request-auth.ts, steward/src/lib/server/respond.ts, steward/src/routes/api/connect/+server.ts, steward/Dockerfile, steward/src/hooks.server.ts, steward/src/lib/client/api.ts, steward/src/lib/client/session.svelte.ts, steward/src/routes/+layout.svelte, steward/src/routes/+page.svelte, steward/src/routes/api/tenants/+server.ts, "steward/src/routes/api/tenants/[slug]/+server.ts", "steward/src/routes/api/tenants/[slug]/accounts/+server.ts", "steward/src/routes/api/tenants/[slug]/accounts/[accountId]/permissions/+server.ts", "steward/src/routes/api/tenants/[slug]/accounts/[accountId]/permissions/[grant]/+server.ts", "steward/src/routes/api/tenants/[slug]/applications/+server.ts", "steward/src/routes/api/tenants/[slug]/applications/[appSlug]/+server.ts", "steward/src/routes/api/tenants/[slug]/invites/+server.ts", "steward/src/routes/api/tenants/[slug]/reactivate/+server.ts", "steward/src/routes/api/tenants/[slug]/role-definitions/+server.ts", "steward/src/routes/api/tenants/[slug]/role-definitions/[name]/+server.ts", "steward/src/routes/api/tenants/[slug]/rotate-keys/+server.ts", steward/src/routes/connect/+page.svelte, steward/src/routes/tenants/+page.svelte, "steward/src/routes/tenants/[slug]/+page.svelte", steward/tests/integration/api-wire.integration.spec.ts]
usage:
  source: log
  seconds: 1745
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 130
      output: 28509
      cache_read: 11286102
      cache_write: 364797
      cost: 4.8327
---
# T-0098 steward builds and passes its suites on SvelteKit 3, vite 8, and vite-plugin-svelte 7

## Work

Bring steward to the versions the forced audit fix chose, if the branch does not carry them yet: `@sveltejs/kit` `^3.1.1`, `@sveltejs/adapter-node` `^6.0.1`, `vite` `^8.3.6`, `vitest` `^5.1.0`. The audit left `@sveltejs/vite-plugin-svelte` at `^4.0.0`, whose peers are vite 5, while kit 3 needs `^7.0.0`, vite `^8.0.12`, and svelte `^5.57.1`: raise the plugin to `^7` (web runs 7.3.1) and `svelte` to `^5.57.1`, and check `svelte-check` and `typescript` against kit 3's peers. Approve in `allowScripts` only the install scripts a build or suite needs. Regenerate `steward/package-lock.json` with npm 12 and `npm ci`.

Then fix what the build and suites report: `vitePreprocess` in `steward/svelte.config.js`, `sveltekit()` in `steward/vite.config.ts`, and `steward/tsconfig.json`. Replace the object form of `error()` in `steward/src/lib/server/request-auth.ts` with string messages, and the deprecated `json` helper in `steward/src/lib/server/respond.ts` and `steward/src/routes/api/connect/+server.ts` with `Response.json`, where kit 3 warns of them. Check the `$app/state` and `$app/navigation` uses in the routes still compile.

It waits for no task: it changes only steward's files.

## Done when

- `npm run build` and `npm run check` in steward pass with no peer dependency warning from kit 3.
- `npm test` and `npm run test:integration` in steward pass, including the Playwright end-to-end tier.

## Notes
