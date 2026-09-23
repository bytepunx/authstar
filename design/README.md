# authstar-design

Design decisions, stories, and reference documentation for the authstar project.

## Contents

- `decisions/` — architecture decision records (ADRs). The authoritative, dated record of
  settled design calls across authstar's services. Consult this before implementing anything
  that touches a decision already recorded here.
- `stories/` — user-facing feature specifications, organized per service.
- `docs/` — supplementary reference material (provider setup guides, operational runbooks, etc.)
- `scripts/clone-siblings.sh` — clones every other `bytepunx/authstar-*` repo as a sibling
  directory of this one (e.g. `~/git/authstar/tower`, `~/git/authstar/keep`, ...). Requires
  the `gh` CLI, authenticated against the `bytepunx` org.

## Related repos

See the root `claude.md` at the workspace level (`~/git/authstar/claude.md`) for the full
system overview. Each service (`portcullis`, `tower`, `keep`, `web`) is its own repository
under the `bytepunx` GitHub organization.
