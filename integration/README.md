# authstar-integration

## What this is (and isn't, yet)

This repo will eventually hold authstar's full cross-service integration test suite —
Kubernetes manifests for all 8 services plus test-scenario orchestration that drives
flows across them. **This first slice builds none of that.** It builds the foundation
everything else sits on: the [signet](https://github.com/bytepunx/signet) secrets/config
repository the 8 services will read their configuration from once deployed.

Per signet's own model, **this git repository is the thing you register with signet** —
there is no separate "provisioning tool" repo. The repo is both the SOPS/age-encrypted
secrets source and (by convention) home to the scripts that provision it. See
[`~/git/signet-smoke-test`](https://github.com/bytepunx/signet-smoke-test) for the
reference pattern this repo's mechanics (not content) are copied from.

What's explicitly **not** here, left for a later task:
- Kubernetes Deployment/Service manifests for the 8 services (see `manifests/NOTE.md`)
- Test-scenario orchestration that deploys them and drives cross-service flows
- A registered GitHub repository — this is purely local for now (see "Not yet done"
  below)

## Directory layout

```
.sops.yaml              placeholder creation_rules; rewritten for real by
                         `signet sops-key update-config` the first time
                         scripts/provision.sh runs against a live cluster
kluster.yaml             cluster name / profile / trust-domain for scripts/up.sh
                         and scripts/down.sh (kluster's "authstar" profile —
                         SPIRE + signet + RabbitMQ + Dex + Postgres + ClickHouse)
manifests/
  admin-rbac.yaml        the one manifest this slice needs (signet-admin RBAC
                          fix; see its own header comment)
  NOTE.md                 placeholder — service Deployments/Services are a
                          later task
scripts/
  lib.sh                  shared constants/helpers (cluster name, trust
                           domain, the shared "authstar" signet namespace)
  lib-secrets.sh           generated: the plaintext source of record for
                           every placeholder secret value (see below)
  up.sh / down.sh          thin kluster wrappers
  provision.sh             the actual signet provisioning flow
secrets/authstar/<service>/<name>.yaml
                         one file per secret, at signet's own
                         <secrets-root>/<namespace>/<service>/<name>.yaml
                         convention (single shared "authstar" namespace, one
                         signet scope per service — ADR 0014)
config/authstar/<service>/config.yaml
                         plain (non-secret) config per service, at signet's
                         <config-root>/<namespace>/<service>.yaml-shaped
                         convention (nested one level deeper here since each
                         service's config is non-trivial — see provision.sh's
                         `--config-path config/` flag, which points at the
                         directory root, not a fixed filename)
```

## Provisioning flow

```
scripts/up.sh          # kluster up --profile authstar; kluster use <cluster>
scripts/provision.sh   # admin RBAC, SOPS key, secrets, deploy key,
                        # repo registration + sync
scripts/down.sh        # kluster down — ALWAYS run this when finished
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

**Partially verified live, honestly reported:**

- `scripts/up.sh` was run against a real disposable cluster (`kluster up --profile
  authstar`, cluster name `authstar-integration`, k3d provider). All 8 addons came up
  healthy: cert-manager, spire, traefik-tls, signet, rabbitmq, dex, postgres, clickhouse
  — full run took ~10m40s.
  - **First attempt hit a real, external problem, not a bug in this repo**: the
    `kluster` binary resolved via `PATH` at verification time was stale relative to
    `~/git/kluster`'s checked-out source — it pulled `docker.io/bitnami/rabbitmq:4.1.3-
    debian-12-r1`, an image reference Broadcom's 2025 Bitnami restructuring removed from
    the free org, and RabbitMQ's init container sat in `ImagePullBackOff`. Current
    `kluster-lib/addon/rabbitmq.go` source already has the fix
    (`bitnamilegacy/rabbitmq`) — a concurrent, unrelated change to the `kluster` repo
    (another agent building a RabbitMQ Topology Operator addon) was in flight against
    the same working tree at the time, which is the likely cause of a stale/overwritten
    installed binary. Fix: built `kluster` fresh from current source into an isolated
    path (`go build -o <scratch>/kluster ./kluster`, never touching the shared
    `bin/kluster` or `/usr/local/bin/kluster` others might be relying on) and re-ran
    `scripts/up.sh` with that binary prepended onto `PATH`. Second attempt succeeded
    cleanly — RabbitMQ installed in 1m23s with no image-pull errors. Not an issue with
    anything in this repo.
- The signet admin RBAC fix (`manifests/admin-rbac.yaml`), admin token minting, `signet
  status` (confirmed `UNSEALED`), SOPS age key creation (`sops-key rotate` — no key
  existed yet), and `sops-key update-config` were all run against that live instance.
  `.sops.yaml`'s placeholder recipient was replaced with the cluster's real one:
  `age15q2h9wv06nxzyvrvu3hzudndk5uc20k59cmz2wrq0zuah9kyfdusp8224q`.
- **`signet secret set` was run for real**, for one representative secret per service
  that currently has any live signet wiring at all — `tower/dbConnectionString`,
  `keep/stripe-secret-key-acme`, `herald/payloadKeyGenerations`,
  `lookout/rabbitmqUrl`, `chronicle/internalJwtSecret`,
  `portcullis/tenant-acme-session-key` — proving the placeholder values in
  `lib-secrets.sh` actually SOPS-encrypt successfully against a real signet-issued age
  key. **Those 6 files are committed here in their real, post-verification
  SOPS-ciphertext state** (not reverted back to plaintext) as concrete evidence — open
  any of them and you'll see genuine `sops:`/`ENC[...]` content with the real recipient
  above, `lastmodified: "2026-08-08T01:51:41Z"`. The other 18 placeholder secrets were
  **not** run through this loop (bounded scope, to keep verification fast) and remain
  plaintext, in the pre-encryption shape `signet secret set` itself would write — a real
  `scripts/provision.sh` run authors and encrypts all 24 the same way.
- **Not run**: the deploy-key / `git push` / `repo add` / `repo sync` steps. Those
  require a real GitHub remote at `bytepunx/authstar-integration`, and this task was
  explicit that creating that repository is separate, later work ("don't create the
  GitHub repo yet... don't push anywhere"). Registering a repo signet would actually
  clone requires that remote to exist first, so this final leg is necessarily
  documented-but-unverified until that later step happens.
- The test cluster was torn down (`scripts/down.sh`) immediately after verification.
  Confirmed via `docker ps/network/volume ls` and `kubectl config get-contexts`: no
  `authstar-integration` containers, networks, volumes, or kubeconfig context remain.

Note for whoever runs `scripts/provision.sh` for real next: it sources `signet` from
`PATH` like any other required command. If `~/git/kluster` (or any other repo a required
CLI is built from) has uncommitted/concurrent changes at that time, rebuild the CLI
fresh into an isolated location first rather than trusting whatever's already on `PATH`
— exactly the failure mode hit and worked around above.

## Not yet done

- No GitHub repository has been created (`bytepunx/authstar-integration` doesn't exist
  yet) — this is purely local. Nothing here pushes anywhere.
- `signet repo add` / `repo sync` therefore haven't been exercised against a real
  registration — see "Live verification status" above.
- Kubernetes Deployment/Service manifests for the 8 services — `manifests/NOTE.md`.
- Test-scenario orchestration across services — no scaffolding for this exists yet
  anywhere in this repo, intentionally.
