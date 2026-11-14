---
id: S-0017
type: story
nature: remediation
title: Golden path reads chronicle's report with a portcullis-forwarded ES256 token
status: done
parent: E-0003
owner: bytepunx
created: 2026-11-06T18:29:54Z
updated: 2026-11-14T09:30:30Z
transitions:
  - to: ready
    at: 2026-11-13T21:35:57Z
    by: bytepunx
  - to: in-progress
    at: 2026-11-13T21:36:03Z
    by: agent-S-0017
  - to: review
    at: 2026-11-14T08:48:12Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-14T09:01:15Z
    by: flai
  - to: review
    at: 2026-11-14T09:10:38Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-14T09:11:31Z
    by: flai
  - to: review
    at: 2026-11-14T09:29:59Z
    by: agent-S-0017
  - to: done
    at: 2026-11-14T09:30:30Z
    by: bytepunx
blocked:
  - from: 2026-11-13T22:32:42Z
    until: 2026-11-14T05:03:09Z
    reason: awaiting the operator on TH-0035
tags: [integration]
topics: [analytics, tls]
touches: [integration/scripts/harness-tls.sh, integration/scripts/deploy.sh, integration/manifests/14-chronicle.yaml, integration/config/authstar/chronicle.yaml, integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md, design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md, design/issues/summary.md, scripts/kluster-deploy.sh, design/stories/tower/012-tenant-creation-and-provisioning.md, tower/spec/behavior/provisioning.spec.ts, tower/src/routes/provisioning.ts, design/issues/I-0025-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md, tower/spec/lib/fakes.ts, design/issues/I-0019-flai-check-finds-roles-definition-outside-the-story-at-close-out.md, design/stories/proxy/006-oauth2-callback.md, portcullis/crates/authstar-middleware/src/identities.rs, portcullis/crates/authstar-middleware/src/oauth/callback.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, design/issues/I-0026-a-kluster-deploy-s-image-build-fails-when-docker-hub-s-token-endpoint-drops-the.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: log
  seconds: 6263
  priced_by: harness
  turns:
    - day: 2026-11-13
      ceremony: 4
      test_runs: 1
      work: 111
    - day: 2026-11-14
      ceremony: 1
      hand_edits: 2
      work: 75
  models:
    - model: claude-opus-5-5
      input: 648
      output: 203480
      cache_read: 104492242
      cache_write: 1764613
      cost: 36.6568
  strategic:
    - kind: planner
      seconds: 450
      estimated: true
      models:
        - model: claude-haiku-5-5
          input: 44
          output: 21289
          cache_read: 1661504
          cache_write: 115928
          cost: 0.1039
        - model: claude-opus-5-5
          input: 58
          output: 26329
          cache_read: 2902938
          cache_write: 143434
          cost: 2.2549
    - kind: orchestrator
      seconds: 356
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 138
          output: 989
          cache_read: 4278331
          cache_write: 632959
          cost: 5.6657
cost_of_delay:
  value: 30
  by: planner-S-0017
  at: 2026-11-09T20:55:39Z
forecast:
  duration: 4h
  delivery: 2026-11-14T22:43:00Z
  basis: "Its own forecast of 4h; 4th in the pull order with an in-progress limit of 4, behind S-0006, S-0013, S-0025, S-0012, S-0007 and S-0008."
  by: flai
  at: 2026-11-13T21:36:02Z
finalized:
  by: bytepunx
  at: 2026-11-09T22:06:44Z
---
# S-0017 Golden path reads chronicle's report with a portcullis-forwarded ES256 token

## Goal

The integration harness's golden path reads a chronicle report through portcullis with the ES256 internal JWT portcullis mints, and chronicle verifies it against the tenant's JWKS inside the cluster. This is the harness half of S-0009's criterion 3, split out on TH-0021.

## Acceptance criteria
- [x] Inside the cluster, `https://authstar.<acme's domain>/.well-known/jwks.json` resolves to portcullis and serves over TLS. The cert is one chronicle trusts.
- [x] The golden path's step 1 gives `acme` a domain, so tower answers it to `GET /tenants/acme`.
- [x] Chronicle's harness config reaches tower and the JWKS host, and `NODE_TLS_REJECT_UNAUTHORIZED=0` is not added beyond what I-0001 already records.
- [x] Step 6 of `integration/scripts/scenario-golden-path.sh` reads chronicle's auth-funnel report through a portcullis application with step 2's session cookie, and passes on a running harness.
- [x] `integration/README.md` no longer lists the in-cluster JWKS gap.

## Tasks
- T-0107 Each deploy loads a harness CA and a cert for authstar.acme.authstar.app into the namespace as Secret authstar-tls
- T-0108 Portcullis resolves authstar.acme.authstar.app and a chronicle application for acme in the harness config
- T-0109 Chronicle's pod resolves authstar.acme.authstar.app to a TLS front that proxies to portcullis, and trusts the harness CA
- T-0110 Golden path gives acme a domain, logs in with the first-admin invite, and step 6 reads chronicle's report through portcullis
- T-0111 integration/README.md drops the in-cluster JWKS gap and documents the TLS front
- T-0137 Tower's portcullis registration adds only _admin to a tenant portcullis already configures
- T-0138 Tower's portcullis registration does not read portcullis's config, which signet refuses on the workload listener
- T-0139 I-0007 is closed once the golden path passes on a running harness
- T-0140 Portcullis sends the login's email to tower's /identities/resolve, so a new account's contact is the invite's
- T-0141 The golden path takes its namespace, prefix, and tokens from flai's FLAI_KLUSTER_* variables, so flai serve's checks run it against the story's namespace
- T-0142 Golden path step 5 reads only its own invite's herald outcome, not the first-admin invite's retries

## Notes

Recorded as I-0007. Findings from S-0009's T-0038:

- Portcullis already forwards its ES256 internal JWT, with the `tenant` header, as `Authorization: Bearer` to any application upstream (`portcullis/crates/authstar-proxy/src/proxy/mod.rs`, `crates/authstar-middleware/src/jwt/internal.rs`). An `acme` application in `integration/config/authstar/portcullis.yaml` whose upstream is `http://chronicle.authstar.svc.cluster.local:3000` delivers a real token.
- `@bytepunx/authstar-fastify` builds the JWKS URL as `https://authstar.<domain>/.well-known/jwks.json`, with the scheme fixed. Portcullis listens plain HTTP on 3710; nothing in `integration/` terminates TLS.
- No CoreDNS rewrite or Service alias maps `authstar.<domain>` in-cluster.
- Step 1 posts `/tenants` without `domain`, so the tenant is domain-pending (ADR-0093).
- Herald and keep have the same in-cluster gap, and their harness `towerBaseUrl` is `http://` while tower serves only https (I-0006).

Needs a live k3d harness to verify. Until it lands, S-0009 leaves step 6 skipping chronicle with the reason.

### Planning

The plan is on the plan thread on S-0017. Five tasks in four layers: T-0107 (the TLS front) and T-0108 (step 1 and the portcullis config) run together, then T-0109 (chronicle's CA trust), then T-0110 (step 6), then T-0111 (the README and I-0007).

What the code shows today (planner's explorer, 2026-11-09):

- Step 1 (`scenario-golden-path.sh` lines 113-125) posts `{slug, name, adminEmail}` with no `domain`. Step 2 checks only that `set-cookie: jwt=` came back and keeps no cookie. Step 6 checks chronicle's 401 and skips the token read (lines 316-319).
- `portcullis.yaml`'s `acme` has one application, `web`, on `acme.authstar.app` and `admin.acme.authstar.app`. No host resolves `authstar.<domain>`.
- Portcullis serves `/.well-known/jwks.json` (`authstar-middleware/src/router.rs:36`), so `integration/README.md` lines 609-610, which say it does not, are stale.
- Tower's `PATCH /tenants/:slug/domain` and a `POST /tenants` with a domain call `patchConfig('portcullis', …)` (`tower/src/routes/provisioning.ts:140-211`). It replaces the whole `acme` tenant, adds only `_admin`, sets the cookie `secure: true`, and uses web's upstream in namespace `authstar-platform`. The comments in `portcullis.yaml` lines 63-77 and README lines 336-345 say tower never patches portcullis; that is stale too.
- `deploy.sh` applies `00`, `01`, and `1[0-7]-*.yaml` only, so new manifests need it changed.
- Chronicle reads the tenant's domain from tower over `https` with `NODE_TLS_REJECT_UNAUTHORIZED=0` already set in `14-chronicle.yaml` (I-0001). It has no CA setting.

Touches, all files, no folders:

| Touch | Source | Why |
|-------|--------|-----|
| `integration/scripts/harness-tls.sh` | design | New: makes the harness CA and a leaf cert for `authstar.<acme's domain>` and loads them as a TLS Secret and a CA ConfigMap (T-0107) |
| `integration/manifests/02-coredns-custom.yaml` | design | New: the CoreDNS rewrite of `authstar.<acme's domain>` to the TLS front's Service (T-0107) |
| `integration/manifests/18-authstar-tls.yaml` | design | New: the TLS front that terminates on 443 and proxies to `portcullis:3710`, keeping `Host` (T-0107) |
| `integration/scripts/deploy.sh` | layout | Runs `harness-tls.sh` and applies the two new manifests, which its glob leaves out (T-0107) |
| `integration/config/authstar/portcullis.yaml` | named in the story's notes, layout | A host for `authstar.<domain>` and a `chronicle` application for `acme` (T-0108) |
| `integration/scripts/scenario-golden-path.sh` | named in criterion 4 | Step 1's domain (T-0108), step 2's cookie and step 6's read (T-0110) |
| `integration/manifests/14-chronicle.yaml` | layout | Mounts the harness CA and sets `NODE_EXTRA_CA_CERTS` (T-0109) |
| `integration/config/authstar/chronicle.yaml` | layout | Its comment on how chronicle reaches tower and the JWKS host (T-0109) |
| `integration/README.md` | named in criterion 5 | Drops the gap and the stale lines, documents the TLS front (T-0111) |
| `design/issues/I-0007-the-integration-harness-cannot-serve-a-tenant-s-jwks-in-cluster-at-https.md`, `design/issues/summary.md` | design | `flai issue close I-0007` rewrites them once criterion 4 has passed (T-0111) |

`flai touches suggest S-0017` listed nothing, since the story declared no touches and named no path to start from. The paths come from the goal, the criteria, these notes, and the harness's layout. The story declared no touches before this plan, so none was kept. Tower's `provisioning.ts` is left out: the harness works with tower as it is, and a change there is a question for the operator, not this plan.

No `after`. S-0009, which this story completes, is done. S-0010 also changes `portcullis.yaml`, `scenario-golden-path.sh`, and `integration/README.md`, but step 6 needs only a report that answers, not the events S-0010 emits; the trial merge judges the shared files. S-0019's T-0088 changes `14-chronicle.yaml`; the same holds.

Forecast: 4h. `flai forecast` gave 6m, then 18m with the touches: 66 s per unit of size over three done remediation stories, too short for this work. It is raised for five tasks with new TLS and DNS setup in the harness and a proof that only a live harness gives, which the operator runs (D-0026). The delivery is flai's date for 7th in the pull order, plus the extra time.

Cost of delay: 30.00 USD a week, as `flai cod S-0017` worked it out. S-0017 has no inputs of its own. E-0003's inputs (30m of time lost a cycle) give 75.00 USD a week, and S-0017's 4h of the 10h forecast over E-0003's two open stories without inputs is its share. It stands.

Criterion 4 needs a running harness. The story's agent runs no cluster commands on this host (D-0026), and config reaches the cluster only through signet's sync from `bytepunx/authstar-integration` (TH-0031, D-0034). So the operator runs step 6, or allows the agent to as on TH-0031.

### Criterion 4

Verified by flai serve's `golden-path` check on s-0017. At 8b27d11, steps 1, 2, 3, 4, and 6 passed, including the chronicle trust proof and the auth-funnel report read through portcullis with step 2's session cookie. Step 5 then failed on the first-admin invite's herald retry. T-0142 fixed that at bab5ba6, and the deploy and checks passed there.
