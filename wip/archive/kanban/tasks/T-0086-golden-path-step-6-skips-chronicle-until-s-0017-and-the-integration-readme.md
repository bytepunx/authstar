---
id: T-0086
type: task
nature: remediation
title: Golden path step 6 skips chronicle until S-0017, and the integration README states chronicle's ES256 verification
status: done
parent: S-0009
owner: alex
created: 2026-11-06T18:30:05Z
updated: 2026-11-06T18:31:01Z
transitions:
  - to: ready
    at: 2026-11-06T18:30:57Z
    by: agent-S-0009
  - to: in-progress
    at: 2026-11-06T18:30:57Z
    by: agent-S-0009
  - to: done
    at: 2026-11-06T18:31:01Z
    by: agent-S-0009
stream: S-0009
tags: []
touches: [integration/scripts/scenario-golden-path.sh, integration/README.md]
usage:
  source: log
  seconds: 4
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 3
      output: 807
      cache_read: 324366
      cache_write: 4072
      cost: 0.1103
---

# T-0086 Golden path step 6 skips chronicle until S-0017, and the integration README states chronicle's ES256 verification

## Work

Chronicle refuses HS256 since T-0034, so golden-path step 6's self-minted HS256 token cannot pass, and the harness cannot verify a genuine token until S-0017 (TH-0021, option A).

- In `integration/scripts/scenario-golden-path.sh`, step 6 keeps lookout's ingest check and asserts that chronicle answers 401 to the auth-funnel report without a token. It then logs a SKIP for the token read, naming S-0017 and I-0007, and the summary counts skips. Remove the inline Python HS256 minting and `CHRONICLE_JWT_SECRET`, and update the header comment.
- In `integration/README.md`, the chronicle row of the secrets/config table drops `internalJwtSecret` and gains `towerBaseUrl`. The golden-path passages and the HS256 known-gap bullet state the ES256 verification and the S-0017 gap.

## Done when

- `grep -n "HS256\|CHRONICLE_JWT_SECRET\|dev-only-insecure-secret" integration/scripts/scenario-golden-path.sh integration/README.md` finds nothing but history.
- `bash -n` passes on the script. `shellcheck` reports nothing new beyond the SC1091 and SC2001 notes main already has.

## Notes

Replaces T-0038, cancelled when criterion 3's harness half moved to S-0017. The live run is S-0017's; this session runs no cluster commands.
