---
id: T-0108
type: task
nature: remediation
title: Portcullis resolves authstar.acme.authstar.app and a chronicle application for acme in the harness config
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:56:07Z
updated: 2026-11-13T21:45:09Z
transitions:
  - to: ready
    at: 2026-11-13T21:42:02Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-13T21:42:03Z
    by: agent-S-0017
  - to: done
    at: 2026-11-13T21:45:09Z
    by: agent-S-0017
stream: S-0017
tags: [integration]
touches: [integration/config/authstar/portcullis.yaml]
usage:
  source: log
  seconds: 186
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 33
      output: 11683
      cache_read: 4326060
      cache_write: 84977
      cost: 1.6098
---
# T-0108 Portcullis resolves authstar.acme.authstar.app and a chronicle application for acme in the harness config

## Work

Criteria 1 and 4, their portcullis half.

- `integration/config/authstar/portcullis.yaml`, tenant `acme`:
  - An application `_admin` with host `authstar.acme.authstar.app`, shaped as tower's registration writes it (`tower/src/routes/provisioning.ts`, `completeDomainDependentProvisioning`), but upstream web in this namespace, so the JWKS host resolves to acme.
  - An application `chronicle` with host `chronicle.acme.authstar.app`, upstream `http://chronicle.authstar.svc.cluster.local:3000`, provider `dex`, so a request with acme's session cookie reaches chronicle with portcullis's ES256 internal JWT.
  - Check both against `portcullis/crates/authstar-config/src/validate.rs` (reserved slugs, duplicate hosts) and the gate's cookie handling, so a cookie issued on `acme.authstar.app` is accepted on the `chronicle` host.
  - The stale comments (tower never patches portcullis; no `_admin` block needed) say what holds now.

## Done when

- The YAML parses, and portcullis's bundle parse and validation accept it (a test run through `flai test`, or the crate's parse on the file).

## Notes
