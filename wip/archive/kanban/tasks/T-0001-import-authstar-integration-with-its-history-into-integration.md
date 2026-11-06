---
id: T-0001
type: task
nature: improvement
title: Import authstar-integration with its history into integration/
status: done
parent: S-0001
owner: alex
created: 2026-10-21T05:07:19Z
updated: 2026-10-21T05:09:00Z
transitions:
  - to: ready
    at: 2026-10-21T05:07:40Z
    by: claude
  - to: in-progress
    at: 2026-10-21T05:07:40Z
    by: claude
  - to: done
    at: 2026-10-21T05:09:00Z
    by: claude
stream: S-0001
tags: []
touches: [integration]
---
# T-0001 Import authstar-integration with its history into integration/

## Work

Merge the `bytepunx/authstar-integration` history under `integration/` the way the other components were imported: a merge commit whose second parent is the original history, with the tree under the prefix.

## Done when

- `integration/` holds the repository's files, `git log -- integration` shows its history, and the merge commit is on `story/S-0001`.

## Notes

Source: a fresh clone of `~/git/authstar-split/integration`, which is at `origin/main` of the original repository. Its secrets are SOPS-encrypted; the plaintext values in `scripts/lib-secrets.sh` are placeholders for the disposable local cluster, which `design/conventions/git.md` allows.
