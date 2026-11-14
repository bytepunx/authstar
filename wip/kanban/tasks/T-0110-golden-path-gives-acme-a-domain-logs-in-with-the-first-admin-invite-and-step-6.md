---
id: T-0110
type: task
nature: remediation
title: Golden path gives acme a domain, logs in with the first-admin invite, and step 6 reads chronicle's report through portcullis
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:56:20Z
updated: 2026-11-13T21:58:01Z
transitions:
  - to: ready
    at: 2026-11-13T21:46:14Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-13T21:46:14Z
    by: agent-S-0017
  - to: done
    at: 2026-11-13T21:58:01Z
    by: agent-S-0017
stream: S-0017
tags: [integration]
touches: [integration/scripts/scenario-golden-path.sh]
after: [T-0107, T-0108, T-0109]
usage:
  source: log
  seconds: 707
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 128
      output: 45677
      cache_read: 16913148
      cache_write: 332227
      cost: 6.2938
---
# T-0110 Golden path gives acme a domain, logs in with the first-admin invite, and step 6 reads chronicle's report through portcullis

## Work

Criteria 1, 2, and 4, in `integration/scripts/scenario-golden-path.sh`.

- Namespace: take S-0006's block verbatim (`KLUSTER_NAMESPACE`, `KLUSTER_PREFIX`, `KLUSTER_TOKENS`, `DB_PREFIX`, `PF_PIDS`, `/dev/tcp`), as agreed with S-0006, so the merge of the two branches meets identical lines.
- Step 1: post `/tenants` with `domain: acme.authstar.app`; when `GET /tenants/acme` still answers no domain (a tenant made before), `PATCH /tenants/acme/domain`; pass only when `GET /tenants/acme` answers the domain.
- Step 2: start the login with `?invite=<token>`, the first-admin invite tower made when the domain was set (`sha256("<slug>:<contactId>:admin-invite")`, first 40 hex characters, `createInviteToken` in `tower/src/routes/provisioning.ts`; the contact from tower's `contacts` table), carry the `authstar-pending-invite` cookie to the callback, and keep the `jwt` cookie as `session_jwt`, the name S-0006 uses. Redeeming it grants `analytics:read`.
- Step 6: keep the 401 check; prove chronicle trusts the front's cert (a `kubectl exec` of `node` in chronicle's container, with `NODE_TLS_REJECT_UNAUTHORIZED` unset, fetching `https://authstar.acme.authstar.app/.well-known/jwks.json`); then read the auth-funnel report through portcullis on `chronicle.acme.authstar.app` with step 2's cookie and pass on 200 with the report's shape, naming status and body otherwise. The skip naming S-0017 and I-0007 goes.
- The header comment says what holds now.

Waits for T-0107, T-0109 (the Secret, the front, the container), and T-0108 (the `chronicle` host).

## Done when

- `bash -n` and `shellcheck` pass, and no skip names S-0017 or I-0007.
- On a running harness (the story's kluster namespace), the golden path passes steps 1, 2, and 6. Its output goes in the Notes; when no run can be made, the Notes say so and criterion 4 stays unticked.

## Notes
