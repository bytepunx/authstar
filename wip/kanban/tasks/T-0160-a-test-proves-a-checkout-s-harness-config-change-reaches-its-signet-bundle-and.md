---
id: T-0160
type: task
nature: remediation
title: A test proves a checkout's harness config change reaches its signet bundle and that no harness script registers a git repository
status: backlog
parent: S-0031
owner: bytepunx
created: 2026-11-14T10:10:02Z
updated: 2026-11-14T10:10:02Z
transitions: []
stream: S-0031
tags: [integration, testing]
touches: [scripts/harness-config.test.mjs, scripts/test.sh, scripts/README.md]
after: [T-0155]
---
# T-0160 A test proves a checkout's harness config change reaches its signet bundle and that no harness script registers a git repository

## Work

Write `scripts/harness-config.test.mjs`, a `node --test` file that reproduces I-0014 on a checkout and passes once T-0155's fix is in. It waits for T-0155 because it tests the push path and the `provision.sh` that T-0155 changes.

- Copy what the push reads (`integration/config/authstar/`, `integration/scripts/lib-secrets.sh`, and `scripts/kluster-signet-push.mjs`) into a temporary directory. Add a field to its `portcullis.yaml` that main's copy lacks, as `keepUpstream` was on S-0006's branch.
- Run the push there with `KLUSTER_DRY_RUN=1`, `FLAI_KLUSTER_NAMESPACE`, an empty `FLAI_KLUSTER_PREFIX`, a temporary `FLAI_KLUSTER_STATE` holding an `amqp-url`, and dummy operator tokens. Assert that the printed `config/authstar/portcullis.yaml` carries the added field. Also run it the way `provision.sh` now runs it, and assert the same.
- Assert that no script under `integration/scripts/` or `scripts/` runs `signet repo add` or `signet repo sync` or names `authstar-integration.git`. That is the regression I-0014 would come back as.
- Never print or assert on a secret's value. Touch no cluster and no network (D-0026).
- Run it from `scripts/test.sh`, the behavior tier, before the per-project suites, so `flai test` runs it.
- Add its row to `scripts/README.md`.

## Done when

- `node --test scripts/harness-config.test.mjs` passes on the branch.
- The test fails when the push is pointed at a config other than the checkout's, or when a `signet repo add` line is put back into `provision.sh`. Check both by hand and revert.
- `scripts/test.sh` runs it, and `scripts/README.md` lists it.

## Notes
