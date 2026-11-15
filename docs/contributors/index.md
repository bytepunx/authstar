---
title: Contributors guide
updated: 2026-11-15
status: active
---

# authstar for contributors

authstar is one repository holding every component. Start with [`design/system/overview.md`](../../design/system/overview.md), which maps the components and links each to the decisions and specifications that govern it.

## Where things are

| You want | Look in |
|----------|---------|
| Why a thing is the way it is | [`design/adrs/`](../../design/adrs/README.md), one decision per file, indexed in its README. Never edit an accepted one; write a new one that supersedes it. |
| What a component was specified to do | [`design/stories/<component>/`](../../design/stories/), the behaviour contracts the code was built against. |
| How the system is now | [`design/system/`](../../design/system/README.md) |
| What it is built with | [`design/tech/`](../../design/tech/README.md) |
| How agents and contributors work here | [`design/conventions/`](../../design/conventions/README.md) and the root `CLAUDE.md` |
| Open work | [`wip/kanban/board.md`](../../wip/kanban/board.md); items are created and moved with `flai` |
| A component's code | Its folder at the root: `portcullis/`, `tower/`, `keep/`, `herald/`, `lookout/`, `chronicle/`, `steward/`, `web/`, `clients/`, `chart/` |
| The full stack on a disposable cluster | [`integration/`](../../integration/README.md): k3d bring-up, SOPS-encrypted secrets, manifests, and the scripted golden-path scenario |

## Running the tests

Three tiers, each run only after the cheaper one passes. The Make targets call the scripts in `scripts/`, and CI runs the same scripts.

| Command | Runs | Needs |
|---------|------|-------|
| `make install` | `npm ci` in every npm project and `cargo fetch` for portcullis | Node 22 or newer, npm, cargo |
| `make test` | Every npm project's `npm test` (behavior and e2e tiers), then `cargo test` and clippy for portcullis | nothing external |
| `make integration` | `npm run test:integration` in every service that has one; testcontainers start Postgres, RabbitMQ, and ClickHouse | a running Docker daemon |
| `make smoke` | The golden-path scenario in `integration/` against a disposable k3d cluster | the cluster `integration/README.md` describes |

To run one project's tests alone, give `scripts/test.sh` its folder: `scripts/test.sh chronicle`, or `scripts/test.sh portcullis` for `cargo test` and clippy. It takes several, and with none it runs every project, as `make test` does. Each project's `TESTING.md` says what its tiers cover.

`flai test` and a story's close-out run only the projects whose files changed. `system-flow.yaml` declares one test tier per project, selected by its folder and running `scripts/test.sh <project>`. A change to `scripts/test.sh` or `scripts/lib-projects.sh` selects every tier, and a change outside every project's folder selects none. Each project needs its `node_modules` (`make install`, or `npm ci` in that folder).

Steward's Playwright e2e picks two free loopback ports on every run and never reuses a server it did not start, so runs in several worktrees at once do not reach each other's servers ([`steward/TESTING.md`](../../steward/TESTING.md)).

CI (`.github/workflows/ci.yml`) runs `make test`'s content as a matrix on every push and pull request, and on `main` builds and pushes the image of each service whose folder changed.

## Making a change

Every change belongs to a story on the board. Pull the top ready story, work on its `story/S-nnnn` branch in the worktree `flai stream open` prints, keep the narrative in `wip/agents/` true, and move the story to review with `flai check --strict` passing. The conventions in `design/conventions/` are the rules; read them first.
