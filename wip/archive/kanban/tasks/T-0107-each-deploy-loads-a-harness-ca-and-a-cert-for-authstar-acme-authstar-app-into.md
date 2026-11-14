---
id: T-0107
type: task
nature: remediation
title: Each deploy loads a harness CA and a cert for authstar.acme.authstar.app into the namespace as Secret authstar-tls
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:55:58Z
updated: 2026-11-13T21:45:04Z
transitions:
  - to: ready
    at: 2026-11-13T21:42:02Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-13T21:42:02Z
    by: agent-S-0017
  - to: done
    at: 2026-11-13T21:45:04Z
    by: agent-S-0017
stream: S-0017
tags: [integration]
touches: [integration/scripts/harness-tls.sh, scripts/kluster-deploy.sh, integration/scripts/deploy.sh]
usage:
  source: log
  seconds: 182
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 16
      output: 5023
      cache_read: 2579271
      cache_write: 43557
      cost: 0.9048
---
# T-0107 Each deploy loads a harness CA and a cert for authstar.acme.authstar.app into the namespace as Secret authstar-tls

## Work

Criterion 1, its cert half.

- New `integration/scripts/harness-tls.sh`: with `openssl`, makes a self-signed harness CA and a leaf cert signed by it for `authstar.acme.authstar.app` (subjectAltName DNS; the hosts overridable), into a directory it is given. It keeps a CA and leaf already in that directory, so a redeploy changes nothing. No key is ever written into the checkout.
- `scripts/kluster-deploy.sh`: a step before the manifests that runs it into `$FLAI_KLUSTER_STATE/tls` and applies a generic Secret `authstar-tls` in the namespace with keys `ca.crt`, `tls.crt`, `tls.key`, rendered to a file and applied (no pipe), through `kc`, so `KLUSTER_DRY_RUN=1` prints it.
- `integration/scripts/deploy.sh`: the same Secret before its manifests, from a temporary directory, kept as it is when the Secret already exists.

The Secret's name and keys are the contract T-0109's pod mounts. No CoreDNS change: the host resolves only inside chronicle's pod (T-0109), so story namespaces sharing one cluster do not collide.

## Done when

- `shellcheck` and `sh -n` pass on the three scripts, and a `KLUSTER_DRY_RUN=1` run of `scripts/kluster-deploy.sh` with the `FLAI_KLUSTER_*` variables set by hand prints the Secret's apply without its key material.
- `harness-tls.sh` run twice into one scratch directory under `bin/S-0017/` keeps the first CA, and `openssl verify -CAfile ca.crt tls.crt` passes with the SAN `authstar.acme.authstar.app`.

## Notes
