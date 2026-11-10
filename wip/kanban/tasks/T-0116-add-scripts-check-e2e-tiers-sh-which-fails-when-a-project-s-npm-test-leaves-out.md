---
id: T-0116
type: task
nature: remediation
title: "Add scripts/check-e2e-tiers.sh, which fails when a project's npm test leaves out its test:e2e, and run it from scripts/test.sh"
status: backlog
parent: S-0022
owner: bytepunx
created: 2026-11-09T22:10:05Z
updated: 2026-11-09T22:10:29Z
transitions: []
stream: S-0022
tags: [web]
touches: [scripts/check-e2e-tiers.sh, scripts/test.sh, scripts/README.md]
---
# T-0116 Add scripts/check-e2e-tiers.sh, which fails when a project's npm test leaves out its test:e2e, and run it from scripts/test.sh

## Work

This is the test that reproduces I-0017's cause: a project whose `npm test` does not reach its `test:e2e`.

- Write `scripts/check-e2e-tiers.sh`, POSIX `sh` under `set -eu`, sourcing `scripts/lib-projects.sh`. For each project in `NODE_PROJECTS` whose `package.json` has a `test:e2e` script, read the `test` script with `node -e` and follow its `npm run <name>` steps. Fail, naming the project, when none of them reaches `test:e2e`.
- Call it at the top of `scripts/test.sh`, before the first project's `npm test`, so the tier stops at once on a project that leaves its e2e out.
- Add its row to the table in `scripts/README.md`.

Waits for nothing.

## Done when

- Before T-0118 changes web's `npm test`, `scripts/check-e2e-tiers.sh` exits non-zero and names `web` alone.
- It passes chronicle, herald, keep, lookout, steward, and tower, whose `npm test` runs their e2e.
- `scripts/test.sh` runs it first.

## Notes

S-0018 may restructure `scripts/test.sh` to select projects by path. Keep the call a single line at the top so a merge with that change stays simple.
