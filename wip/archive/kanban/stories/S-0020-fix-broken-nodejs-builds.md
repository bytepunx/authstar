---
id: S-0020
type: story
nature: remediation
title: Fix broken nodejs builds
status: done
owner: bytepunx
created: 2026-11-09T08:02:53Z
updated: 2026-11-09T20:44:26Z
transitions:
  - to: ready
    at: 2026-11-09T08:02:56Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-09T08:08:44Z
    by: agent-S-0020
  - to: review
    at: 2026-11-09T09:41:44Z
    by: agent-S-0020
  - to: done
    at: 2026-11-09T20:44:26Z
    by: bytepunx
tags: [herald, keep, steward, web, chronicle, tower, lookout]
topics: [dependencies, testing]
touches: [herald/package.json, herald/package-lock.json, herald/vitest.config.ts, herald/spec/integration/rabbitmq.integration.spec.ts, herald/spec/integration/herald.integration.spec.ts, keep/package.json, keep/package-lock.json, keep/vitest.config.ts, keep/spec/integration/plan-mappings.integration.spec.ts, keep/spec/integration/entitlement-publishing.integration.spec.ts, steward/package.json, steward/package-lock.json, steward/svelte.config.js, steward/vite.config.ts, steward/tsconfig.json, steward/src/lib/server/request-auth.ts, steward/src/lib/server/respond.ts, steward/src/routes/api/connect/+server.ts, web/package.json, web/package-lock.json, web/svelte.config.js, web/vite.config.ts, web/vitest.config.ts, web/vitest.components.config.ts, web/vite.widgets.config.ts, web/tsconfig.json, web/src/hooks.server.ts, web/src/lib/server/guard.ts, chronicle/package.json, chronicle/package-lock.json, tower/package.json, tower/package-lock.json, lookout/package.json, lookout/package-lock.json, lookout/spec/integration/events.integration.spec.ts, design/tech/tech-stack.md, steward/Dockerfile, steward/src/hooks.server.ts, steward/src/lib/client/api.ts, steward/src/lib/client/session.svelte.ts, steward/src/routes/+layout.svelte, steward/src/routes/+page.svelte, steward/src/routes/api/tenants/+server.ts, "steward/src/routes/api/tenants/[slug]/+server.ts", "steward/src/routes/api/tenants/[slug]/accounts/+server.ts", "steward/src/routes/api/tenants/[slug]/accounts/[accountId]/permissions/+server.ts", "steward/src/routes/api/tenants/[slug]/accounts/[accountId]/permissions/[grant]/+server.ts", "steward/src/routes/api/tenants/[slug]/applications/+server.ts", "steward/src/routes/api/tenants/[slug]/applications/[appSlug]/+server.ts", "steward/src/routes/api/tenants/[slug]/invites/+server.ts", "steward/src/routes/api/tenants/[slug]/reactivate/+server.ts", "steward/src/routes/api/tenants/[slug]/role-definitions/+server.ts", "steward/src/routes/api/tenants/[slug]/role-definitions/[name]/+server.ts", "steward/src/routes/api/tenants/[slug]/rotate-keys/+server.ts", steward/src/routes/connect/+page.svelte, steward/src/routes/tenants/+page.svelte, "steward/src/routes/tenants/[slug]/+page.svelte", steward/tests/integration/api-wire.integration.spec.ts, web/Dockerfile, web/kit.config.ts, web/src/env.ts, web/src/lib/server/config.ts, web/src/routes/(hosted)/signup/+page.svelte, design/tech/npm.md, design/tech/sveltekit.md, design/tech/testcontainers.md, design/tech/vitest.md, web/src/lib/components/SubmitButton.svelte, design/tech/README.md, steward/src/routes/+error.svelte]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 5592
  priced_by: harness
  turns:
    - day: 2026-11-09
      ceremony: 5
      test_runs: 6
      hand_edits: 4
      work: 71
  models:
    - model: claude-opus-5-5
      input: 514
      output: 112534
      cache_read: 44549785
      cache_write: 1439967
      cost: 19.0761
  strategic:
    - kind: planner
      seconds: 2757
      estimated: true
      models:
        - model: claude-haiku-5-5
          input: 52
          output: 24917
          cache_read: 2023935
          cache_write: 118030
          cost: 0.1187
        - model: claude-opus-5-5
          input: 333
          output: 47466
          cache_read: 26031594
          cache_write: 241030
          cost: 8.0852
    - kind: orchestrator
      seconds: 140
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 64
          output: 494
          cache_read: 1836598
          cache_write: 261994
          cost: 2.4283
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 0
    time_lost_per_cycle: 2h
    by: agent-S-0020
    at: 2026-11-09T08:48:26Z
  value: 300
  by: planner-S-0020
  at: 2026-11-09T08:48:52Z
forecast:
  duration: 5h
  basis: "Planner's estimate over flai's 1h default: two SvelteKit 2-to-3 migrations, vitest and testcontainers majors in five services, and full integration and end-to-end runs, in six tasks."
  by: planner-S-0020
  at: 2026-11-09T08:10:09Z
---
# S-0020 Fix broken nodejs builds

## Goal

Forcing audit fixes has broken herald, keep, steward, and web. Each need to be fixed to work with the latest dependencies.

## Acceptance criteria
- [x] All tests pass across every nodejs project

## Tasks
- T-0096 herald installs and passes its suites on vitest 5, testcontainers 12, and npm 12
- T-0097 keep installs and passes its suites on vitest 5, testcontainers 12, and npm 12
- T-0098 steward builds and passes its suites on SvelteKit 3, vite 8, and vite-plugin-svelte 7
- T-0099 web builds and passes its suites on SvelteKit 3 and adapter-node 6
- T-0100 chronicle, tower, and lookout carry the audit's bumps and still pass their suites
- T-0101 Every node project passes from a clean install, and the tech stack records the new versions
- T-0102 keep installs and passes its suites on vitest 5, testcontainers 12, and npm 12
- T-0103 chronicle, lookout, and tower install and pass their suites on vitest 5 and testcontainers 12
- T-0104 steward installs and passes its suites on SvelteKit 3, vite 8, and vitest 5
- T-0105 web installs and passes its suites on SvelteKit 3
- T-0106 design/tech records SvelteKit 3, vitest 5, testcontainers 12, and npm 12's install-script approvals

## Notes

### At acceptance

- S-0020's `allowScripts` entries approve farmhash in herald and keep, and tower already approved it. That resolves I-0016 and the draft story S-0021 made from it. Recommended: cancel S-0021 and close I-0016 when S-0020 is accepted.
- web still imports through a `$lib` alias that SvelteKit 3 deprecates and warns about on every run (`design/tech/sveltekit.md`). Recommended follow-up: move web to `#lib` subpath imports, as steward now does.

### Planning

Written by planner-S-0020 on 2026-11-09. The plan is summarised on TH-0033, and the inputs on TH-0032.

Touches: the story declared none, and `flai touches suggest` had nothing to start from. Each touch I wrote comes from the layout:
- The forced audit fix's uncommitted diff on main gave every `package.json` and `package-lock.json` it changed.
- The explorer's read of the installed packages gave the rest: the vitest and vite configs, `svelte.config.js`, and `tsconfig.json`; the testcontainers integration specs each project runs; and steward's `error()` and `json` callers, which kit 3 deprecates.

`design/tech/tech-stack.md` comes from the design: it names SvelteKit 2 and the test stack. The story's agent has since widened the touches with the files its tasks changed. No folder touch is kept.

Tags: herald, keep, steward, web, chronicle, tower, and lookout were added because `flai check` must tell which components the story delivers to (`story.component-tag`). No task could be written without them.

Forecast: `flai forecast` gave 1h, `planning.default_duration` for a story of one criterion and no touches, since too few stories are done to learn from. It was raised to 5h for:
- two SvelteKit 2-to-3 migrations; steward also needs vite-plugin-svelte 4-to-7, which the audit missed;
- vitest and testcontainers majors in five services;
- integration and end-to-end runs in every project.

Cost of delay: 300 USD a week, as `flai cod` works it out and unadjusted. The operator confirmed these inputs on TH-0032: `time_lost_per_cycle` 2h, with `revenue_per_week` and `penalty_per_week` 0. That is 2h lost per 168h cycle at the project's 150 USD an hour, one cycle a week.

Version bumps: per TH-0032, S-0020 carries the audit's bumps in its worktree. The operator discards main's uncommitted copies of the 14 `package.json` and `package-lock.json` files before accepting it.

After: none. The story reads no other story's output. S-0008 may land a farmhash `allowScripts` entry in herald's and keep's `package.json` first (TH-0030); if so, T-0096 and T-0097 keep it.
