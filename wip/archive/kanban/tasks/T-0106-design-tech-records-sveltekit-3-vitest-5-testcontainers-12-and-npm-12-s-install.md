---
id: T-0106
type: task
nature: remediation
title: design/tech records SvelteKit 3, vitest 5, testcontainers 12, and npm 12's install-script approvals
status: cancelled
parent: S-0020
owner: alex
created: 2026-11-09T08:18:50Z
updated: 2026-11-09T08:19:21Z
transitions:
  - to: cancelled
    at: 2026-11-09T08:19:21Z
    by: agent-S-0020
stream: S-0020
tags: [docs, dependencies]
touches: [design/tech/README.md, design/tech/tech-stack.md, design/tech/sveltekit.md, design/tech/vitest.md, design/tech/testcontainers.md, design/tech/npm.md]
after: [T-0096, T-0102, T-0103, T-0104, T-0105]
---
# T-0106 design/tech records SvelteKit 3, vitest 5, testcontainers 12, and npm 12's install-script approvals

## Work

`design/tech/README.md` says to split `tech-stack.md` one file per technology when a dependency next changes; this story changes four. Write `design/tech/sveltekit.md`, `vitest.md`, `testcontainers.md`, and `npm.md`, each with the version each project now pins, where it is used, why, and the alternatives, and move what `tech-stack.md` says about them there, leaving a link. `sveltekit.md` says configuration now lives in the `sveltekit(...)` plugin, not `svelte.config.js`. `npm.md` says npm 12 runs no install script a project's `allowScripts` does not approve, which packages each project approves, and why the rest are left out. Index the new files in `design/tech/README.md`.

It waits for T-0096, T-0102, T-0103, T-0104, and T-0105: it records the versions and approvals they settle.

## Done when

- `design/tech` names the versions and `allowScripts` approvals the project files on the story's branch carry, and `flai check --strict` is clean.

## Notes
- 2026-11-09T08:19:21Z: moved to cancelled: duplicates the planner's task drafted at the same time; kept the planner's (TH-0033)
