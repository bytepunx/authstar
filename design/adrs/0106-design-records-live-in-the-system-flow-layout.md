---
id: ADR-0106
title: Design records live in the system-flow layout
status: accepted
date: 2026-10-21
supersedes: []
superseded_by: []
---

# ADR-0106 Design records live in the system-flow layout

## Context

authstar's design was written in a separate `authstar-design` repository: 104 numbered ADRs under `decisions/`, per-service stories under `stories/`, and a consolidated tech stack under `docs/`. On 2026-09-23 that repository was imported into this monorepo as `design/`, and the system-flow template was laid over it, which added an empty `design/adrs/`, a template `design/system/`, and `design/tech/`. Two layouts then coexisted: the template's checks ignored the real decisions, agents had no single place to look, and a new ADR recorded with `flai adr new` would have restarted the numbering at 0001 beside the existing 0001.

## Decision

The original ADRs and stories are folded into the system-flow layout and that layout is the only one.

- `design/decisions/` is moved to `design/adrs/`, keeping every number and slug; `flai adr new` continues from 0106.
- Each moved ADR receives the template's front matter (`id`, `title`, `status`, `date`, `updated`, `supersedes`, `superseded_by`), derived from its own status and date lines, and one opening sentence under `## Decision` derived from its first decision heading or its title, so the standard's checks and the prime pack can read it. The bodies are otherwise unchanged. ADR-0099, a proposal with no decision section, gains one that says so.
- `design/stories/` stays where it is as the behaviour contracts the components were built against, each file with `title`, `updated`, and `status` front matter. New work is tracked in `wip/kanban`, not as new story files there.
- `design/docs/tech-stack.md` moves to `design/tech/tech-stack.md` as the consolidated technology record until it is split one file per technology.
- `design/CLAUDE.md` and `design/scripts/clone-siblings.sh` are removed: the root `CLAUDE.md` and the monorepo replace them.
- Every link to the old paths, in design documents and in code comments, is rewritten to the new ones.

## Consequences

- `flai check --strict` can pass, so the repository has one standard it is checked against.
- Readers and agents find every decision in one folder with one index.
- The front matter and opening sentence are the only additions ever made to the accepted ADRs; the rule in `design/conventions/decisions.md` against editing accepted ADRs holds from here on, with this migration recorded as the one exception.
- The `updated` date on each moved ADR is the date of the last commit that touched it in this repository, which is the import, not the original edit.

## Alternatives considered

- Leave `design/decisions/` beside `design/adrs/` and start new ADRs at 0001: two numbering sequences for one system; rejected.
- Rewrite the old ADRs into the template's heading structure: changes accepted decisions' text; rejected.
- Move the stories into `wip/kanban` as work items: they are contracts for existing code, not open work; rejected.
