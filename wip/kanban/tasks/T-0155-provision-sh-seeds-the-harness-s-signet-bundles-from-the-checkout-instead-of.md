---
id: T-0155
type: task
nature: remediation
title: provision.sh seeds the harness's signet bundles from the checkout instead of registering bytepunx/authstar-integration
status: backlog
parent: S-0031
owner: bytepunx
created: 2026-11-14T10:09:52Z
updated: 2026-11-14T10:09:52Z
transitions: []
stream: S-0031
tags: [integration, signet]
touches: [integration/scripts/provision.sh, integration/scripts/lib.sh, integration/scripts/lib-secrets.sh, scripts/kluster-signet-push.mjs]
---
# T-0155 provision.sh seeds the harness's signet bundles from the checkout instead of registering bytepunx/authstar-integration

## Work

This task removes the cause I-0014 records. `integration/scripts/provision.sh` makes signet read the harness's config from `git@github.com:bytepunx/authstar-integration.git` on `main`, so a story branch's change to `integration/config/authstar/*.yaml` never reaches the cluster. Its steps 6 and 7 do this: a GitHub deploy key on that repository, a commit and push of `secrets/`, `config/`, and `.sops.yaml`, then `signet repo add --branch main` and `signet repo sync`.

- Remove those steps, the `gh` and `ssh-keygen` requirements, `REPO_SLUG`, `REPO_GIT_URL`, the deploy key, and `.integration-repo-id`.
- Seed the eight bundles for the `authstar` namespace from the working tree through `SyncBundle`, by running `scripts/kluster-signet-push.mjs` as `scripts/kluster-signet.sh` does (D-0036). It reads `integration/config/authstar/*.yaml` and `integration/scripts/lib-secrets.sh` from the checkout, so a branch's config change is pushed as it stands.
- If the push needs a value only a kluster deploy writes, such as `$FLAI_KLUSTER_STATE/amqp-url`, give `provision.sh` that value for the default namespace from `lib-secrets.sh`. Do not change how a story namespace's deploy calls the push.
- Keep the SOPS key, the secret authoring, and the ADR-0103 policy grants that `provision.sh` already does, unless the push makes them redundant. Say which in the commit.
- Update the comments in `lib.sh` and `lib-secrets.sh` that describe the repo-sync flow.
- Keep `KLUSTER_DRY_RUN=1` printing secret names and never values.
- Check each changed script with `shellcheck` and `sh -n` or `bash -n`, and the push with `KLUSTER_DRY_RUN=1`. Agents on this host run no cluster commands (D-0026), so run nothing against a cluster.

This task waits for no other: it is the fix the rest of the story tests and documents.

## Done when

- `provision.sh` contains no `signet repo add`, `signet repo sync`, `gh repo deploy-key`, `git push`, or `authstar-integration.git`.
- `provision.sh` pushes each service's config and secrets from the checkout through `kluster-signet-push.mjs`.
- A story namespace's `scripts/kluster-signet.sh` dry run prints the same bundles as before this task.
- `shellcheck` passes on the changed shell scripts.

## Notes
