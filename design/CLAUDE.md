## authstar-design

Design decisions, stories, and reference documentation for the authstar project.

## Purpose

This repo is the source of truth for *why* authstar's services are built the way they are.
Implementation repos (`portcullis`, `tower`, `keep`, `web`) should not need to re-derive
architecture decisions — they should link back here.

## Folder Structure

- `decisions/` — Architecture Decision Records (ADRs), numbered sequentially
  (`0001-...`, `0002-...`). Each ADR captures a settled design decision: the context that
  motivated it, the decision itself, and its consequences (including follow-on work it
  creates in other repos, and open research items it doesn't resolve).
- `stories/` — user-facing feature specifications, one subfolder per service
  (e.g. `stories/proxy/`, `stories/tower/`). Written once a decision is settled enough to
  implement against.
- `docs/` — reference material that isn't a decision or a story (provider setup guides,
  operational runbooks, etc.)

## Working Conventions

- ADRs are immutable once accepted — if a decision changes, write a new ADR that
  supersedes the old one (link both ways) rather than editing history.
- An ADR should call out concretely which other repos/stories it affects, not just describe
  the decision in the abstract.
- Reference implementations for the original portcullis design are available at
  `~/git/authstar/ref-design` and `~/git/authstar/ref-proxy` — useful for context on prior
  art, but authstar's actual design is whatever is recorded here, not there.
