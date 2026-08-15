# authstar-integration

## What this is

Local/CI orchestration for standing up the full authstar stack on a disposable
Kubernetes cluster: signet provisioning (secrets/config for all 8 services), the
Deployment/Service manifests for all 8, the scripts that drive both plus the cluster
lifecycle, and `scripts/scenario-golden-path.sh` — a repeatable, scripted test of the
golden path (tenant provisioning → portcullis auth → tower → keep billing → herald key
rotation → chronicle analytics) against a real cluster.

Per signet's own model, **this git repository is the thing you register with signet** —
there is no separate "provisioning tool" repo. The repo is both the SOPS/age-encrypted
secrets source and (by convention) home to the scripts that provision it. See
[`~/git/signet-smoke-test`](https://github.com/bytepunx/signet-smoke-test) for the
reference pattern this repo's mechanics (not content) are copied from.

**Before running anything against a real cluster**, read "A critical, unresolved bug"
under "Golden-path scenario" below — herald must stay at 0 replicas (or the bug fixed)
before any real `comms.transactional.*` traffic flows, or its consumer can spin at
1,000+ messages/second indefinitely.

## Directory layout

```
.sops.yaml              placeholder creation_rules; rewritten for real by
                         `signet sops-key update-config` the first time
                         scripts/provision.sh runs against a live cluster
kluster.yaml             cluster name / profile / trust-domain for scripts/up.sh
                         and scripts/down.sh (kluster's "authstar" profile —
                         SPIRE + signet + RabbitMQ + Dex + Postgres + ClickHouse)
manifests/
  admin-rbac.yaml        signet-admin RBAC fix (see its own header comment)
  00-namespace.yaml       the "authstar" namespace + service accounts
  01-db-init-job.yaml     per-service Postgres databases + chronicle's
                          ClickHouse database
  10-tower.yaml           Deployment/Service per service, each with TCP
  11-keep.yaml             liveness/readiness probes
  12-herald.yaml
  13-lookout.yaml
  14-chronicle.yaml
  15-steward.yaml
  16-web.yaml
  17-portcullis.yaml
  11-keep-pricing-sync-cronjob.yaml
                          daily CronJob re-syncing plan-mapping pricing from
                          Stripe (design/stories/keep/003's "Periodic
                          pricing re-sync") -- reuses keep's own image/
                          ServiceAccount, no separate identity
  12-herald-retention-purge-cronjob.yaml
                          daily CronJob purging encrypted communication
                          payloads past their type's retention window (ADR
                          0029) -- same shape as the keep job above, reuses
                          herald's own image/ServiceAccount
scripts/
  lib.sh                  shared constants/helpers (cluster name, trust
                           domain, the shared "authstar" signet namespace)
  lib-secrets.sh           generated: the plaintext source of record for
                           every placeholder secret value (see below)
  up.sh / down.sh          thin kluster wrappers
  provision.sh             the signet provisioning flow (secrets/config)
  deploy.sh                applies namespace + db-init + all 8 service
                           manifests; requires DOCKERHUB_USERNAME/
                           DOCKERHUB_TOKEN in the environment for the
                           imagePullSecret (see the script's own header)
  deploy-local.sh          same as deploy.sh, but builds + imports images
                           locally instead of pulling from DockerHub -- see
                           "scripts/deploy-local.sh (new)" below
  scenario-golden-path.sh  the repeatable, scripted cross-service test --
                           see "Golden-path scenario" below
secrets/authstar/<service>/<name>.yaml
                         one file per secret, at signet's own
                         <secrets-root>/<namespace>/<service>/<name>.yaml
                         convention (single shared "authstar" namespace, one
                         signet scope per service — ADR 0014)
config/authstar/<service>.yaml
                         plain (non-secret) config per service. MUST be a flat
                         file at exactly <config-root>/<namespace>/<service>.yaml
                         — signet's own ParseConfigPath (internal/gitops/path.go)
                         requires exactly 2 path components after the config
                         root and errors otherwise. An earlier version of this
                         repo nested these one level deeper
                         (config/authstar/<service>/config.yaml, on the theory
                         that non-trivial config needed its own directory) —
                         that never actually synced: signet's gitops sync
                         silently ignored every file at 3+ components, so
                         every service's config bundle was empty. Only
                         portcullis noticed (Rust's Bundle struct fails loudly
                         on a missing required field); tower/keep/herald
                         appeared to work because dbConnectionString/
                         rabbitmqUrl are also provisioned as secrets with a
                         `bundle.field ?? secrets.field` fallback in their own
                         code — the secret half masked the broken config half.
                         Confirmed for real against a live cluster, not
                         theoretical.
```

## Provisioning + deployment flow

```
scripts/up.sh          # kluster up --profile authstar; kluster use <cluster>
scripts/provision.sh   # admin RBAC, SOPS key, secrets, deploy key,
                        # repo registration + sync
scripts/deploy.sh       # namespace, db-init Job, all 8 service Deployments/
                        # Services -- run after provision.sh (pods crashloop
                        # on a bundle-fetch failure if run before it)
scripts/down.sh         # kluster down — ALWAYS run this when finished
```

`scripts/provision.sh` is adapted line-for-line from signet-smoke-test's own
`provision.sh`, generalized from one toy service to authstar's 8 real ones:

1. Apply `manifests/admin-rbac.yaml` (signetd's admin RPCs 403 without it — see the
   file's own comment).
2. Port-forward signet's admin port, mint a `signet-admin` token, confirm `signet
   status`.
3. Ensure a SOPS age key exists (`sops-key rotate` if none), then `sops-key
   update-config` — this rewrites `.sops.yaml`'s placeholder recipient with the live
   cluster's real public key. **Must** happen before the next step, since `signet
   secret set` encrypts against whatever `.sops.yaml` currently names.
4. Author all 24 placeholder secrets via `signet secret set`, one call per entry in
   `lib-secrets.sh`'s `SECRET_ENTRIES` list.
5. Ensure a read-only GitHub deploy key exists, commit, push.
6. Register the repo with signet (`repo add`, or reuse an existing registration), then
   trigger an explicit `repo sync`.

Idempotent throughout — safe to re-run against an already-provisioned cluster, matching
signet-smoke-test's own idempotency checks (existing SOPS key / repo registration are
detected and reused rather than duplicated; `secret set` is naturally idempotent since
it's just "overwrite plaintext, re-encrypt").

### Why secret values live in `lib-secrets.sh`, not just in `secrets/*.yaml`

`secrets/authstar/**/*.yaml` starts out as **plaintext placeholders** — the exact shape
`signet secret set` itself writes before it shells out to `sops --encrypt --in-place`.
After a real `scripts/provision.sh` run, those files become genuine SOPS ciphertext
(same as every file already committed in `signet-smoke-test/secrets/`).

That creates a problem for idempotent re-runs: signet's whole threat model is that the
age *private* key never leaves signetd — the CLI has no `secret get`/decrypt path, by
design. So once a file is real ciphertext, nothing on your laptop can read the
placeholder value back out of it to feed to `secret set` again next time.

`scripts/lib-secrets.sh` solves this by being the durable plaintext source of record,
generated once (see below) and never overwritten by `provision.sh`. Every value in it is
byte-identical to what's currently committed in `secrets/*.yaml` (verified at authoring
time — see "Regenerating placeholder secrets").

### Regenerating placeholder secrets

Both `secrets/authstar/**/*.yaml` and `scripts/lib-secrets.sh` were generated from one
Python script (not committed to this repo — it shelled out to `openssl` for the EC/RSA
key material and was run once at authoring time). If you need to rotate a placeholder
value, edit `lib-secrets.sh`'s `SECRET_VALUE__<service>__<name>` variable directly and
copy the same value into the matching `secrets/authstar/<service>/<name>.yaml`'s `value:`
field (or just let the next `scripts/provision.sh` run overwrite the latter — either
way, keep them in sync until this repo grows a real regeneration script of its own).

## What's provisioned, per service

Confirmed against each service's **actual code**, not just ADRs (see the task's own
research notes for full file:line citations — summarized here). ADR 0014 covers
portcullis/tower specifically; the `ns/authstar/sa/<service>` namespace convention for
the other 6 is extrapolated from ADR 0004's generic pattern plus tower/keep/herald's own
`SIGNET_NAMESPACE`-from-env plumbing, since no ADR pins down every service by name.

| Service | Secrets | Config | Live signet wiring in app code? |
|---|---|---|---|
| tower | `dbConnectionString`, `rabbitmqUrl`, `signetAdminToken`, `contactHashPepper`, `operatorToken`, `default-provider-client-secret`, `tenant-acme-contact-hash-pepper` | `dbConnectionString`, `rabbitmqUrl`, `provisioning.*` | Yes |
| keep | `dbConnectionString`, `rabbitmqUrl`, `signetAdminToken`, `stripe-secret-key-acme`, `stripe-webhook-secret-acme` | `dbConnectionString`, `rabbitmqUrl` | Yes |
| herald | `dbConnectionString`, `rabbitmqUrl`, `payloadKeyGenerations`, `unsubscribeKeyGenerations` | `dbConnectionString`, `rabbitmqUrl` | Yes |
| lookout | `rabbitmqUrl` | `rabbitmqUrl` | **No** — reads `LOOKOUT_RABBITMQ_URL` env var directly; scope provisioned ahead of the wiring landing |
| chronicle | `clickhousePassword`, `rabbitmqUrl`, `internalJwtSecret` | `clickhouseUrl`, `clickhouseUsername`, `clickhouseDatabase`, `retentionMonths`, `maxDateRangeDays`, `queryTimeoutMs`, `rateLimitMax`, `rateLimitWindowMs` | **No** — reads `CHRONICLE_*` env vars directly |
| portcullis | `tenant-acme-session-key`, `tenant-acme-internal-key`, `tenant-acme-identity-hash-key-1`, `tenant-acme-provider-dex-client-secret` | `webUpstream`, `towerUpstream`, `tenants.acme.*` (full `Bundle` struct shape) | Yes (Rust, `authstar-config` crate) |
| steward | *(none)* | `towerUrl`, `heraldUrl` | **No** `@bytepunx/signet-client` dependency at all; reads plain env vars |
| web | *(none)* | `towerBaseUrl`, `publicTowerBaseUrl`, `internalJwtJwksUrl` | **No** `@bytepunx/signet-client` dependency at all; reads plain env vars |

All secrets use tenant slug `acme` for consistency with portcullis's own
`examples/signet_smoke.rs` live smoke test, which already asserts against
`tenant-acme-session-key`.

### Confirmed-from-code vs. inferred-from-ADR — the interesting bits

- **tower ↔ portcullis key-format mismatch (a real cross-repo bug, not an ADR gap):**
  tower's `randomSecret()` (`src/routes/provisioning.ts`) generates `tenant-<slug>-session-key`
  and `tenant-<slug>-internal-key` as 32 opaque random bytes (base64url). But
  `authstar-middleware`'s actual JWT-signing code requires those two specifically to be
  **PEM-encoded P-256/ES256 EC private keys** — confirmed both from `authstar-config`'s
  own doc comments and from `examples/signet_smoke.rs` asserting the fetched secret
  "looks like a PEM private key". As shipped, tower's provisioning flow would push key
  material portcullis can't parse. This repo's placeholders use real EC P-256 PEM keys
  (`openssl ecparam -name prime256v1 -genkey`) for those two secrets — correct per
  portcullis's actual consumer code, but a mismatch worth fixing in tower itself, outside
  this task's scope.
- **keep's Stripe secret naming diverges from ADR 0046:** the ADR specifies
  `tenant-<slug>-stripe-secret-key`; the shipped code (`signet-stripe-config-store.ts`)
  actually looks up `stripe-secret-key-<slug>` (prefix/suffix swapped). This repo follows
  the code, since that's what keep will actually query at runtime.
- **herald's `payloadKeyGenerations`/`unsubscribeKeyGenerations` key names are explicitly
  unratified** — herald's own `server.ts` comment (lines 34–46) calls them "this file's
  own best-effort guess, not a contract anything else in this design has committed to."
  Used here as the only concrete names that exist anywhere; flagged as unstable.
- **tower's singular `contactHashPepper` vs. the per-tenant `tenant-<slug>-contact-hash-pepper`
  it pushes but never reads back:** both are provisioned here since either could plausibly
  be a live gap in tower rather than intentional, and it costs nothing to provision both.
- **lookout, chronicle, steward, web have zero live signet-client wiring** as of this
  writing — every one of the four has an explicit code comment flagging signet
  integration as future work. Their scopes/config are provisioned ahead of that landing so
  the plumbing exists once it does; nothing currently reads these values at runtime.
- **portcullis's `Bundle` struct fields** (`webUpstream`, `towerUpstream`,
  `identityHashKeyGenerations`, full `TenantJwtConfig`/`CookieConfig`/`ApplicationConfig`
  shapes) are confirmed directly from `crates/authstar-config/src/bundle.rs`'s serde
  struct definitions (`#[serde(rename_all = "camelCase")]`) — ADR 0014 only sketches the
  `tenants: { <slug>: { hosts: [...] } }` skeleton, not the full shape.

Dev connection values (Postgres/RabbitMQ/ClickHouse/Dex) point at kluster's `authstar`
profile's actual in-cluster Helm-installed addon DNS names and fixed dev credentials —
confirmed from `~/git/kluster/kluster-lib/addon/{postgres,rabbitmq,clickhouse,dex}.go`,
not guessed:
- Postgres: `postgresql.postgres.svc.cluster.local:5432`, `postgres`/`postgres`
- RabbitMQ: `rabbitmq.rabbitmq.svc.cluster.local:5672`, `guest`/`guest`
- ClickHouse: `clickhouse.clickhouse.svc.cluster.local:8123` (HTTP interface), `default`/`clickhouse`
- Dex: `http://dex.dex.svc.cluster.local:5556`, static client `authstar` / secret
  `authstar-dev-secret`

## Golden-path scenario (`scripts/scenario-golden-path.sh`)

A real, repeatable, checked-in script exercising tenant provisioning → portcullis auth
→ tower → keep billing → herald key rotation → chronicle analytics, against a live
cluster (`scripts/up.sh` + `scripts/provision.sh` + `scripts/deploy.sh`/`deploy-local.sh`
first). Run it directly: `./scripts/scenario-golden-path.sh`. Every step drives a real
API call — no mocking — and reports PASS/FAIL per step, exiting non-zero if anything
failed. See the script's own header comment for the exact auth mechanics per step (why
tower's operator routes rather than a JWT-verified path, why keep uses a self-computed
Stripe webhook signature, why chronicle mints its own HS256 token, and why herald's step
deliberately stops short of sending a real email — see "A critical, unresolved bug"
below).

This script was **not** written from documentation and trusted — every single step was
first driven by hand against a real cluster, and every failure that surfaced along the
way was chased to a real root cause and fixed (not worked around) before being captured
here. That process found and fixed the following, all confirmed against live pods/logs/
databases, not asserted:

- **A stale `kluster` CLI binary** (predating both the Postgres/ClickHouse addon work and
  the RabbitMQ image-removal fix) blocked cluster bring-up entirely — see "Note for
  whoever runs this next" below.
- **signet's chart gained a new safety guard** (`admin.clusterAccess: true` now requires
  either `admin.tls.enabled` or an explicit `admin.tls.acknowledgeInsecure: true` — see
  `bytepunx/signet#24`) that `kluster`'s own `signetValues()` never set, fixed directly in
  `~/git/kluster/kluster-lib/addon/signet.go` (same dev-only-insecure posture as every
  other value in that block).
- **Stale RabbitMQ credentials, repeatedly** — tower/keep/herald/lookout/chronicle were
  all still pointing at a specific RabbitMQ user/password copied from a *previous*
  cluster instance (this repo's own git history shows this exact fixup happening
  more than once: "chore: update RabbitMQ credential for the fresh authstar-integration
  cluster instance"). The topology operator generates a fresh credential on every
  `kluster up`; `guest`/`guest` does **not** work here (confirmed live —
  `ACCESS_REFUSED`). herald/lookout/chronicle aren't in `rabbitmqTargetServices`
  ("today: tower, keep", ADR 0008/0012) so they now share tower's own dedicated
  credential (its Permission resource is a fully-permissive dev-only wildcard) rather
  than guessing at a nonexistent shared login.
- **`config/authstar/herald.yaml`/`lookout.yaml` were comment-only files** — an
  empty/comment-only YAML file parses to `nil`, not a mapping, so signetd logged a parse
  error on *every single sync cycle* (`config file must be a YAML mapping, got <nil>`,
  every 5 minutes, silently, for as long as this repo has existed). Not currently
  blocking (neither service reads anything through this path yet) but a real, confirmed,
  previously-invisible bug — not fixed in this pass (out of scope for the scenario
  itself), flagged here for whoever adds real config for either service next.
- **Two services never had `signetAdminToken` provisioned as a *real* token** — tower's
  and herald's own calls into signetd's admin gRPC API (`pushSecret`, used during tenant
  provisioning and key rotation) need a genuine Kubernetes-issued ServiceAccount token,
  not an arbitrary placeholder string; both had only ever been given a fake
  `dev-placeholder-...` value, never exercised for real before this pass (because `acme`
  itself had never actually been provisioned through tower's real route — see below).
  Real `kubectl create token signet-admin -n signet --audience signet --duration=1h`
  tokens are pushed for both as a same-session stopgap (short-lived by Kubernetes'
  TokenRequest design, not a permanent fix) — both services need their own rotation
  CronJob long-term, matching kickr's own `rabbitmq-provisioner-rotate` pattern for the
  identical class of problem.
- **herald never had its own `operatorToken` provisioned at all** — blocks
  `POST /operator/rotate-keys` entirely (needed to distribute herald's real
  payload-encryption public key to tower). Added.
- **`acme` had never actually been provisioned through tower's real `POST /tenants`
  route** — despite this README previously claiming the golden path was "proven working
  end-to-end," a fresh check this pass (`\dt` against the live `tower` Postgres database)
  showed only a bare `contacts` table — no `tenant`/`account`/`identity` rows existed
  anywhere. `acme` only ever existed as static config fed to portcullis/Dex, never as a
  real tower tenant. Fixed by actually calling `POST /tenants` for real.
- **portcullis's `towerUpstream.address` still said `http://`** even though tower's own
  server has run real, unconditional SPIFFE mTLS since earlier work on tower itself —
  `tower_http_client` (`authstar-middleware/src/state.rs`) genuinely is mTLS-configured,
  but `reqwest` never attempts a TLS handshake at all when the URL scheme says `http://`,
  regardless of how the client's own TLS connector is set up. Every east-west call from
  portcullis to tower (`/identities/resolve` at login, `/enrich` per-request) was silently
  broken until this was fixed (`config/authstar/portcullis.yaml`, one-word change).
- **portcullis never registered `admin.acme.authstar.app` as a host** — the per-tenant
  JWKS convention (`perTenantJwksKeyProvider`) every JWT-consuming service resolves
  against needs it, but tower's own provisioning route never patches portcullis's Bundle
  config (confirmed: no `signetAdmin.patchConfig` call anywhere in `provisioning.ts`,
  only `rotate-keys.ts` uses `patchConfig`, for EC key generation arrays — host routing is
  a GitOps/deploy-time concern this repo owns, not something tower auto-provisions).
  Fixed by adding the host to the existing `web` application's `hosts` list (confirmed
  via reading portcullis's own `jwks_handler.rs`: it only needs the Host to resolve to
  *some* active application for the tenant, discarding which one matched — no separate
  `_admin` application block needed).
- **chronicle rejects `eventType: "auth.login"`** — the real, only-recognized value is
  `auth.login-succeeded` (confirmed directly against `chronicle/src/consumer/
  map-event.ts`'s own comment quoting ADR 0085's DDL). A wrong `eventType` isn't a loud
  error either — chronicle logs `"chronicle: dropping malformed analytics event"` and
  moves on, so this is easy to miss without checking logs directly.
- **`kubectl port-forward` sessions in this environment die silently and often** — every
  service restart (including the self-triggered "signet bundle changed, restarting"
  behavior tower/keep/herald all have) kills any port-forward targeting that pod; a stale
  forward doesn't error loudly, it just refuses new connections. The scenario script
  establishes its own forwards fresh on every run rather than assuming any are already up.

### A critical, unresolved bug: herald's comms consumer can loop infinitely

**Do not create a new invite (or otherwise trigger a `comms.transactional.*` publish)
against this cluster until this is fixed.** Confirmed live, twice, independently: creating
one invite caused herald's own `herald.comms` RabbitMQ queue to redeliver the *same two
messages* at **over 1,300 messages/second**, reaching 700k–1.4M+ redeliveries within
minutes — real, sustained CPU burn, not a benign retry.

Root cause, fully traced:

1. Tower encrypts every `comms.*` payload it publishes using `heraldPayloadPublicKey`
   from its own signet bundle — but that secret was never populated in this cluster
   (confirmed: tower logs "no signet-sourced herald payload-encryption public key
   configured yet" on every boot), so tower falls back to a **fresh, random ephemeral
   key every time it restarts**, per ADR 0025/0081's own documented fallback.
2. herald's `POST /operator/rotate-keys` (see it now correctly provisioned above) is
   meant to fix this — it pushes herald's real public key to
   `authstar/tower/heraldPayloadPublicKey` via `signetAdmin.pushSecret`, and reports
   success (confirmed: `{"rotated":[{"key":"payload-encryption","version":2}],"failed":[]}`).
3. **But tower's own subsequent bundle fetch never picks it up** — confirmed repeatedly:
   fresh tower pod restarts, multiple `signet repo sync` calls in between, and tower
   *still* logs the same "no signet-sourced herald payload-encryption public key"
   fallback message every time. This looks like a genuine signetd-internals question
   (something about how a directly-`pushSecret`'d value becomes visible to a workload's
   regular `getServiceBundle` fetch) that this pass could not root-cause within a
   reasonable stopping point — it is **not** something this repo's own config can fix.
4. Because of (3), any new comms message tower publishes is encrypted with a key herald
   can never decrypt — a **permanent** failure, not a transient one.
5. herald's `src/lib/comms-consumer.ts` doesn't distinguish the two: *any* error from
   `ingestCommunication` other than a JSON-parse failure hits
   `channel.nack(msg, false, true)` — unconditional requeue, no backoff, no
   dead-lettering, and the actual error is silently swallowed (`.catch(() => {...})`,
   never logged) — so the permanent decryption failure becomes an invisible, infinite,
   maximum-speed retry loop instead of a visible, one-time error.

Mitigated for this session by scaling herald to 0 replicas and purging the queue via the
RabbitMQ management API (`DELETE /api/queues/authstar/herald.comms/contents`, admin
credentials at `kubectl get secret rabbitmq-topology-operator-connection -n rabbitmq`) —
not fixed. Two real fixes are needed, in two different repos, before herald can safely
run against live comms traffic again:

1. Root-cause why tower's bundle fetch doesn't see a secret `pushSecret`'d shortly after
   a `signet repo sync` (signetd or its client library, not this repo).
2. `herald/src/lib/comms-consumer.ts` should distinguish permanent failures (decryption,
   malformed payload) from transient ones (a momentary store outage) and dead-letter the
   former instead of requeuing forever — plus log the swallowed error either way.

`scripts/scenario-golden-path.sh`'s own herald step only verifies the key-rotation API
call itself (safe — it doesn't touch `comms.*` traffic), never a full send, specifically
because of this.

## Live verification status

**Re-verified live this pass** (superseding this section's own prior claim that the
golden path was "proven working end-to-end" — that claim did not survive a fresh check:
`acme` had never actually been provisioned as a real tower tenant, see above):

- `scripts/up.sh` (with the `kluster`/signet fixes above) → `scripts/provision.sh` →
  `scripts/deploy-local.sh` (new — see below) brought up a real disposable cluster with
  all 8 services `1/1 Running`, backed by real signet-sourced secrets/config.
- `scripts/scenario-golden-path.sh` passes end-to-end: real tenant provisioning, a real
  Dex authorization-code + PKCE login (driven with plain curl, no headless browser — see
  the script for the exact 6-request sequence), tower genuinely resolving/creating the
  account, a real Stripe-signature-verified webhook call to keep, herald's real operator
  key-rotation API, and a real lookout → RabbitMQ → ClickHouse → chronicle-report chain.
  herald's full send-and-verify path remains blocked — see "A critical, unresolved bug"
  above.
- The GitHub repository (`bytepunx/authstar-integration`, private) received real pushes
  throughout this pass — the deploy-key/`repo add`/`repo sync` steps work as designed.

### `scripts/deploy-local.sh` (new)

A local-build alternative to `deploy.sh` for anyone without `DOCKERHUB_USERNAME`/
`DOCKERHUB_TOKEN` (or who wants a fully offline loop): builds all 8 service images from
their own repos' Dockerfiles, imports them directly into the k3d server node's
containerd (`docker save | docker exec ... ctr -n k8s.io images import -`, the same
mechanism `kluster`'s own `rabbitmq-kickr` addon already documents for this exact class
of problem), then applies the same manifests `deploy.sh` does with every
`imagePullPolicy: Always` rewritten to `IfNotPresent` on the fly. No image pull secret
is created — with the image already present and `IfNotPresent` set, the kubelet never
attempts a registry pull, so the manifests' own `imagePullSecrets` reference is simply
never resolved. The committed manifests themselves are untouched (`Always`, correct for
the real DockerHub-backed CI/prod path) — the rewrite happens only in a scratch copy.

### Note for whoever runs this next

- `provision.sh`/`up.sh` source `signet`/`kluster` from `PATH` like any other required
  command. If `~/git/signet` or `~/git/kluster` have uncommitted/concurrent changes,
  **rebuild both CLIs fresh into an isolated location first** rather than trusting
  whatever's on `PATH` — both were stale in this pass (predating, respectively, the
  signet chart's new `admin.tls` guard and the RabbitMQ image-removal fix / Postgres/
  ClickHouse addons), and a stale `kluster` binary blocks cluster bring-up entirely, not
  just cosmetically.
- **Always run `scripts/down.sh` when finished.** This project has had real, repeated
  problems with abandoned clusters left running — this pass's own cluster was torn down
  at the end; confirm the next person does the same.

## Not yet done

- **Fix the two herald bugs** described in "A critical, unresolved bug" above — the
  tower-doesn't-see-a-freshly-pushed-secret mystery, and comms-consumer.ts's
  requeue-forever-on-any-error design. Herald must stay at 0 replicas (or these fixed)
  before any real comms traffic flows through this cluster again.
- **`kubectl port-forward` reliability** — this pass worked around silent forward death
  by re-establishing forwards fresh each run rather than fixing the underlying flakiness;
  a longer-running test harness (e.g. a CI job) would want retry/reconnect logic instead.
- **A rotation mechanism for tower's and herald's own `signetAdminToken`** — both are
  currently a manually-minted, short-lived (1h) Kubernetes token, a same-session stopgap
  documented in `scripts/lib-secrets.sh`'s own comments, not a durable fix. Needs a
  CronJob matching kickr's own `rabbitmq-provisioner-rotate` pattern.
- **`config/authstar/herald.yaml`/`lookout.yaml`'s comment-only-YAML parse error** —
  confirmed real and currently silent (logged every sync cycle, blocking nothing yet
  since neither service reads anything through this path). Worth fixing before either
  service gains real config needs, so the failure mode isn't "silently ignored" the first
  time it matters.
- Chronicle's HS256-vs-tower's-ES256 internal-JWT algorithm mismatch (flagged by an
  earlier pass of this repo, still real, still unaddressed) — chronicle's `analytics:read`
  routes accept a self-minted HS256 token using a known dev secret specifically because a
  genuine portcullis-forwarded internal JWT can never pass its check.
- Web's own JWKS wiring (`INTERNAL_JWT_JWKS_URL`/`AUTHSTAR_BASE_DOMAIN`, currently unset
  in `manifests/16-web.yaml`) — even with portcullis's own JWKS host fix in this pass,
  web running *inside* the cluster has no DNS path to fetch
  `https://admin.acme.authstar.app/.well-known/jwks.json` (confirmed live: that hostname
  doesn't resolve from inside any pod at all — no in-cluster DNS entry for the public
  tenant domain exists). A real fix needs in-cluster DNS wiring for the public tenant
  hostname (CoreDNS rewrite rules or similar), not just a web env var — a separate,
  deeper gap than this pass's own portcullis config fix, out of scope here.
