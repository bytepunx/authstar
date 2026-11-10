---
id: T-0120
type: task
nature: improvement
title: scripts/test.sh runs only the projects it is given, and every project with none
status: backlog
parent: S-0018
owner: bytepunx
created: 2026-11-09T22:10:46Z
updated: 2026-11-09T22:10:46Z
transitions: []
stream: S-0018
tags: [testing, scripts]
touches: [scripts/test.sh, scripts/lib-projects.sh, scripts/README.md]
---
# T-0120 scripts/test.sh runs only the projects it is given, and every project with none

## Work

Give `scripts/test.sh` optional project arguments: each an npm project path from `NODE_PROJECTS` in `scripts/lib-projects.sh`, or `portcullis`. With arguments it runs only those projects: `npm test` for an npm project, and `cargo test` and clippy for portcullis. With none it runs every project as it does today, so `make test` and CI keep their behaviour. Refuse an unknown project name with exit status 2 and a message naming the known ones. Keep the script POSIX `sh` under `set -eu`, and quote every variable, as `tooling.md` asks.

This task waits for none: it is the first layer, and the manifest's tiers in the next layer call it with a project name.

Update the `test.sh` row of `scripts/README.md` to say it takes project names.

## Done when

- `scripts/test.sh chronicle` runs chronicle's `npm test` alone and exits as it does.
- `scripts/test.sh portcullis` runs only `cargo test` and clippy.
- `scripts/test.sh nosuch` exits 2 and names the known projects.
- `scripts/test.sh` with no argument runs every project, as before.
- `scripts/README.md` describes the arguments.

## Notes
