---
id: T-0038
type: task
nature: remediation
title: Golden path's chronicle-report step reads the report with a portcullis-forwarded ES256 token
status: backlog
parent: S-0009
owner: bytepunx
created: 2026-11-06T17:51:20Z
updated: 2026-11-06T17:51:20Z
transitions: []
stream: S-0009
tags: [chronicle, integration]
touches: [integration/scripts/scenario-golden-path.sh, integration/config/authstar/portcullis.yaml, integration/manifests/17-portcullis.yaml, integration/README.md]
after: [T-0037, T-0036]
---
# T-0038 Golden path's chronicle-report step reads the report with a portcullis-forwarded ES256 token

## Work

Replace the self-minted HS256 token in step 6/6 of `integration/scripts/scenario-golden-path.sh` with the internal JWT portcullis forwards:

- Give the `acme` tenant a path through portcullis to chronicle. Do it in `integration/config/authstar/portcullis.yaml`, for example as an application whose upstream is chronicle's in-cluster service, so a request carrying step 2's `jwt` session cookie reaches chronicle with portcullis's ES256 internal JWT. Prefer bundle config to portcullis code.
- Make the tenant's JWKS reachable from inside the cluster at the URL `perTenantJwksKeyProvider` builds, `https://authstar.<tenant domain>/.well-known/jwks.json`:
  - add that host to the tenant in `portcullis.yaml`, beside or in place of the ADR-0089-era `admin.acme.authstar.app`;
  - add the in-cluster DNS and TLS the harness lacks. The integration README's "Not yet done" section names the DNS gap.
- In step 6, call chronicle's auth-funnel report through portcullis with the session cookie. Remove the inline Python HS256 minting and `CHRONICLE_JWT_SECRET`, and update the script's header comment.
- Update `integration/README.md`: the "why chronicle mints its own HS256 token" passage and the known-gap bullet on chronicle's HS256-vs-ES256 mismatch.

## Done when

- `grep -n "HS256\|CHRONICLE_JWT_SECRET\|dev-only-insecure-secret" integration/scripts/scenario-golden-path.sh integration/README.md` finds nothing but history.
- `bash -n` and `shellcheck` pass on the script.
- Step 6 passes on a running harness (`make` target or `integration/scripts/up.sh`, then the scenario) with the token portcullis forwarded. If this environment cannot bring the k3d cluster up, leave the story's third criterion unticked and say so in the story's Notes, as S-0006 did.

## Notes

The step needs the scripted login's account to hold `analytics:read`. Tower's tenant provisioning grants the admin permissions (see `tower/src/routes/provisioning.ts`). If the only working path needs portcullis code, or TLS termination the harness cannot get from config, stop and raise it on the S-0009 plan thread: it is outside this story's touches. Add any new manifest the DNS or TLS wiring needs to this task's touches when you close it.
