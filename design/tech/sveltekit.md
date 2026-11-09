---
title: SvelteKit
updated: 2026-11-09
status: active
topics: [web, steward, sveltekit]
---

# SvelteKit

`web` and `steward` are SvelteKit 3 apps on Svelte 5 (runes) and TypeScript. Both build with adapter-node and run as plain long-lived Node processes.

## Versions

| Package | web | steward |
|---------|-----|---------|
| `@sveltejs/kit` | ^3.1.1 | ^3.1.1 |
| `@sveltejs/adapter-node` | ^6.0.1 | ^6.0.1 |
| `@sveltejs/vite-plugin-svelte` | ^7.2.0 | ^7.3.1 |
| `svelte` | ^5.57.1 | ^5.57.1 |
| `vite` | ^8.2.1 | ^8.3.6 |
| `typescript` | ^6.0.3 | ~6.0.3 |
| `@playwright/test` | ^1.62.1 | ^1.47.0 |

TypeScript 6 is required: kit 3's optional `typescript` peer is `^6`, and npm refuses the install with 5.x present. S-0020 moved both apps from SvelteKit 2, after a forced `npm audit fix` took kit to 3.

## Why

- Svelte 5 and SvelteKit are current and stable, and one framework serves the tenant admin app, the hosted pages, and the operator console.
- Testing is the standard SvelteKit pairing: [vitest](vitest.md) for unit, component, and integration tiers, and Playwright for end to end.
- `steward` shares `web`'s stack. It has no Web Component package of its own and, per ADR 0044 and ADR 0048, no Tailwind requirement beyond what is simplest for its small, unbranded screen set.

## How the apps are configured under SvelteKit 3

| Concern | SvelteKit 2 | SvelteKit 3, as used here |
|---------|-------------|---------------------------|
| Kit configuration | `svelte.config.js` | Passed to the `sveltekit(...)` plugin. steward writes it in `steward/vite.config.ts`. web writes it once in `web/kit.config.ts`, which `vite.config.ts` and `vitest.config.ts` both pass in. Kit 3 refuses to start while a `svelte.config.js` exists (`config_file_unsupported`). |
| `$lib` | Built in | Removed. steward imports through the `#lib/*` subpath import in its `package.json`. web declares a `$lib` alias in `kit.config.ts`, which kit 3 deprecates and warns about on every run. |
| Environment variables | `$env/dynamic/private`, `$env/dynamic/public` | `$app/env/private` and `$app/env/public`. web declares every variable it reads in `web/src/env.ts` with `defineEnvVars`, all optional; `web/src/lib/server/config.ts` still decides which are required in each mode (ADR 0102). |
| `tsconfig.json` | Extends `./.svelte-kit/tsconfig.json` | Extends `$app/tsconfig`, with its own `include`. |
| `error()` | Takes a string or an object | steward passes a string. |
| `json()` helper | From `@sveltejs/kit` | `Response.json`. A bodiless success, such as a 204, returns `new Response(null, …)`. |
| `Handle` type | From `@sveltejs/kit` | From `@sveltejs/kit/hooks`. |

web keeps the deprecated `$lib` alias for now because S-0011 changes web's routes at the same time, and rewriting 44 imports in 22 files would conflict with it. Moving web to `#lib` and dropping the alias is follow-up work.

### CSRF and steward's client

Kit 3's CSRF check refuses a POST, PUT, PATCH, or DELETE that has no Content-Type, or a form Content-Type, unless its `Origin` is the server's own. adapter-node 6 has no `ORIGIN` variable and takes the server's own origin to be `https://<host>`. Operators reach steward over a plain-http port-forward, so the origins never match.

So steward's client (`steward/src/lib/client/api.ts`) sends `Content-Type: application/json` on every mutating call, including calls with no body. `steward/tests/integration/api-wire.integration.spec.ts` checks that a bodiless POST without it is refused with 403. The alternatives were `csrf.trustedOrigins: ['*']`, which turns the check off, and a build-time origin, which cannot work because the port-forward's port varies.

## Styling and the widget package

- The admin apps use Tailwind CSS: fast iteration for admin and operator screens with no design-system requirement of their own.
- That does not change the embeddable Web Component widgets' theming (ADR 0044, ADR 0072). They stay on plain CSS custom properties because they ship into arbitrary host pages and cannot assume Tailwind, or any build step, is present there.
- The Web Component widget package (ADR 0072's six custom elements) is a separate build target from the SvelteKit admin app: Vite library mode (`web/vite.widgets.config.ts`), with no SvelteKit plugin and no Svelte runtime. It lives in `web` but bundles on its own, so adopting applications load a small, dependency-free script tag.
