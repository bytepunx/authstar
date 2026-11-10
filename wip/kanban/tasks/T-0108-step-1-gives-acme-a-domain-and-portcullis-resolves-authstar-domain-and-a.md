---
id: T-0108
type: task
nature: remediation
title: "Step 1 gives acme a domain, and portcullis resolves authstar.<domain> and a chronicle application for acme"
status: backlog
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:56:07Z
updated: 2026-11-09T20:56:07Z
transitions: []
stream: S-0017
tags: [integration]
touches: [integration/scripts/scenario-golden-path.sh, integration/config/authstar/portcullis.yaml]
---
# T-0108 Step 1 gives acme a domain, and portcullis resolves authstar.<domain> and a chronicle application for acme

## Work

Criterion 2, and the portcullis half of criteria 1 and 4.

- In `integration/scripts/scenario-golden-path.sh` step 1 (lines 113-125), post `domain` with `acme`, or set it with `PATCH /tenants/acme/domain` after creation (ADR-0093), and check that `GET /tenants/acme` answers it. Use `acme.authstar.app` unless T-0107 settles another; the two must agree.
- In `integration/config/authstar/portcullis.yaml`, under `tenants.acme`: give `authstar.<domain>` a host that resolves to `acme`, so the JWKS route answers there, and add a `chronicle` application on its own host with upstream `http://chronicle.authstar.svc.cluster.local:3000`. Correct the comment at lines 63-77: tower does call `patchConfig` once a domain is set.
- Tower's patch (`tower/src/routes/provisioning.ts:140-211`) replaces the whole `acme` tenant, adds only `_admin`, sets the cookie `secure: true`, and points web at namespace `authstar-platform`. Find out whether it reaches portcullis in the harness and what it leaves of the static `acme`. If it would break step 2 or drop the `chronicle` application, do not change tower: ask the operator on a thread on S-0017, with your recommendation, and go on with the rest.

It waits for no task: T-0107 changes none of these files.

## Done when

- Step 1 sets the domain and fails when `GET /tenants/acme` does not answer it.
- `portcullis.yaml` parses, and portcullis's config validation accepts it (its config crate's tests, or the harness's bundle check).
- What tower's patch does to `acme` in the harness is written in the task's Notes, with a thread on S-0017 when it needs the operator.
- `sh -n` and `shellcheck` pass on the script.

## Notes
