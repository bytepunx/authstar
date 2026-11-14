---
id: T-0141
type: task
nature: remediation
title: "The golden path takes its namespace, prefix, and tokens from flai's FLAI_KLUSTER_* variables, so flai serve's checks run it against the story's namespace"
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-14T09:02:23Z
updated: 2026-11-14T09:03:35Z
transitions:
  - to: ready
    at: 2026-11-14T09:03:27Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-14T09:03:27Z
    by: agent-S-0017
  - to: done
    at: 2026-11-14T09:03:35Z
    by: agent-S-0017
stream: S-0017
tags: []
touches: [integration/scripts/scenario-golden-path.sh, integration/README.md]
usage:
  source: log
  seconds: 8
  estimated: true
  priced_by: harness
  models: []
---
# T-0141 The golden path takes its namespace, prefix, and tokens from flai's FLAI_KLUSTER_* variables, so flai serve's checks run it against the story's namespace

## Work

TH-0051: flai serve's golden-path check of s-0017 at 771a8f5 failed. Its log starts `namespace authstar, database prefix ''`. The script read only `KLUSTER_NAMESPACE`, `KLUSTER_PREFIX`, and `KLUSTER_TOKENS`, so it ran against main's namespace `authstar`, without the namespace's operator tokens. Tower and herald answered 403, and chronicle in `authstar` has no TLS front.

- `integration/scripts/scenario-golden-path.sh`: before S-0006's block, which stays verbatim, `KLUSTER_NAMESPACE` and `KLUSTER_PREFIX` default to `FLAI_KLUSTER_NAMESPACE` and `FLAI_KLUSTER_PREFIX`. `KLUSTER_TOKENS` defaults to `$FLAI_KLUSTER_STATE/tokens.env` when that file can be read.
- `integration/README.md`: the run command says flai's variables are enough.

## Done when

- `bash -n` and `shellcheck` pass.
- With the `FLAI_KLUSTER_*` variables of s-0017 set and no cluster reached (`kubectl` absent from `PATH`), the script logs `namespace s-0017, database prefix 's0017_'` before it fails on the missing command.
- flai serve's checks run passes after the move back to review.

## Notes
