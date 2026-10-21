---
title: Contributors guide
updated: 2026-10-21
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

## Running a component's tests

Each component keeps its own test tiers and commands; its `TESTING.md` or `README.md` says which. The Node components run `npm ci && npm test` for the behaviour and end-to-end tiers; `portcullis` runs `cargo test --workspace`. Root-level `make test`, `make integration`, and `make smoke` are being wired to run every component (story S-0002).

## Making a change

Every change belongs to a story on the board. Pull the top ready story, work on its `story/S-nnnn` branch in the worktree `flai stream open` prints, keep the narrative in `wip/agents/` true, and move the story to review with `flai check --strict` passing. The conventions in `design/conventions/` are the rules; read them first.
