# authstar-integration

## What this is

Local/CI orchestration for standing up the full authstar stack on a disposable
Kubernetes cluster: signet provisioning (secrets/config for all 8 services), the
Deployment/Service manifests for all 8, and the scripts that drive both plus the
cluster lifecycle. This is what the golden-path proof (tenant provisioning → portcullis
auth → tower → keep billing → herald email → chronicle analytics, all working
end-to-end on a real cluster) was actually run against.

Per signet's own model, **this git repository is the thing you register with signet** —
there is no separate "provisioning tool" repo. The repo is both the SOPS/age-encrypted
secrets source and (by convention) home to the scripts that provision it. See
[`~/git/signet-smoke-test`](https://github.com/bytepunx/signet-smoke-test) for the
reference pattern this repo's mechanics (not content) are copied from.

Not yet here: test-scenario orchestration that drives cross-service flows as repeatable,
scripted scenarios (the golden-path run so far has been a manual/interactive
verification pass, not a checked-in test suite) — see "Not yet done" below.

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

## Live verification status

**Fully verified live**, superseding an earlier, narrower partial-verification pass
(6-of-24-secrets, no deployment) whose details this section used to describe:

- `scripts/up.sh`/`scripts/provision.sh`/`scripts/deploy.sh` were run end-to-end against
  a real disposable cluster (`authstar-integration`, k3d provider) — all 8 services
  deployed and running, backed by real signet-sourced secrets/config (all 24 secrets are
  genuine SOPS ciphertext, not the earlier partial 6-of-24 state), all addons healthy
  (signet, RabbitMQ, Dex, Postgres, ClickHouse).
- The golden path was proven working end-to-end on that cluster: tenant provisioning →
  portcullis auth → tower → keep billing → herald email → chronicle analytics, with
  every claim checked against live pods/logs/databases rather than asserted. Several
  real cross-service bugs were found and fixed along the way (not pre-existing repo
  content — actual product-code bugs, fixed in their own repos): a Dex redirect-URI
  rejection, a corrupted bcrypt hash in Dex's static user config, chronicle rejecting
  RFC3339 timestamps on insert (ClickHouse `DateTime64` wanted a different format),
  and chronicle's `latencyMs` column being too narrow a type for values lookout's own
  schema permits.
- The GitHub repository now exists (`bytepunx/authstar-integration`, private) and this
  local checkout is pushed to it — the deploy-key/`repo add`/`repo sync` steps this
  section previously reported as unverified have since been exercised for real.

**Known issue as of this writing**: the `authstar-integration` k3d cluster from that
verification run is **still up** — `scripts/down.sh` was not run afterward. This repo's
own `down.sh` header comment is explicit about exactly this failure mode ("This project
has had real problems with abandoned clusters left running for hours — always run this
when you're done"). Run `scripts/down.sh` (or `kluster down --name authstar-integration`
directly) before this becomes another instance of it.

Note for whoever runs `scripts/provision.sh`/`scripts/deploy.sh` next: `provision.sh`
sources `signet` from `PATH` like any other required command. If `~/git/kluster` (or any
other repo a required CLI is built from) has uncommitted/concurrent changes at that time,
rebuild the CLI fresh into an isolated location first rather than trusting whatever's
already on `PATH` — this was hit for real during the first verification pass (a stale
`kluster` binary pulled an image reference Broadcom's 2025 Bitnami restructuring had
already removed).

## Not yet done

- Test-scenario orchestration across services — repeatable, scripted cross-service
  flows (the golden-path proof so far has been a manual/interactive verification pass,
  not something checked into this repo as a runnable test suite). No scaffolding for
  this exists yet anywhere in this repo.
- Tearing down the currently-running `authstar-integration` cluster — see "Known issue"
  in "Live verification status" above.
