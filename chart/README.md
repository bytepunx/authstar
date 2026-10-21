# authstar-chart

A single Helm chart that deploys all eight authstar services --
`chronicle`, `herald`, `keep`, `lookout`, `portcullis`, `steward`, `tower`,
`web` -- and, via a `pre-install,pre-upgrade` hook Job, provisions each
service's plain config (`PutServiceConfig`) and secrets (`SyncBundle`) in
[signet](https://github.com/bytepunx/signet) before the services' own pods
start.

See [ADR 0104](../design/adrs/0104-helm-chart-and-provisioning-hook.md)
and [Story 001](https://github.com/bytepunx/authstar-design/blob/main/stories/chart/001-chart-layout-and-provisioning-hook.md)
in `bytepunx/authstar-design` for the design this chart implements.

## What this chart does NOT do

- It does not install or manage signet itself -- signet is assumed to
  already be running, reachable at the bootstrap coordinates you supply in
  `values.yaml`.
- It does not template a `Namespace` -- the target namespace must already
  exist (created by the operator, or by whatever addon/GitOps tooling wires
  this chart in, e.g. a kluster addon).
- It does not template either of the two Secrets it depends on
  (`imagePullSecretName`, `hook.adminTokenSecretRef`) -- you create those
  once, out of band, before installing or upgrading.
- It does not manage chart versioning/publishing (Helm repo index, OCI
  registry) or a kluster addon entry -- tracked as follow-up work.

## Prerequisites

Before installing, in the target namespace:

1. **An image pull secret** for docker.io, named to match
   `values.imagePullSecretName` (default `dockerhub-credentials`):

   ```
   kubectl create secret docker-registry dockerhub-credentials \
     --docker-server=docker.io \
     --docker-username=<user> \
     --docker-password=<token> \
     -n <namespace>
   ```

2. **A signet operator bearer token Secret**, referenced by
   `values.hook.adminTokenSecretRef.{name,key}`:

   ```
   kubectl create secret generic signet-admin-token \
     --from-literal=token=<the operator token> \
     -n <namespace>
   ```

   This token is read only by the provisioning hook Job at install/upgrade
   time. It is never mounted into any of the eight services' own pods --
   those continue to use their existing SPIFFE-scoped runtime access to
   signet (ADR 0103), unaffected by this chart.

## Installing

### Plain `helm install`

```
helm install authstar . \
  -n authstar-platform \
  --set hook.signetAdminAddr=signet-admin.signet.svc.cluster.local:8444 \
  --set hook.adminTokenSecretRef.name=signet-admin-token \
  --set hook.adminTokenSecretRef.key=token \
  -f values-secrets.yaml   # your own file, holding each service's `secrets:` maps -- not committed to git
```

`helm upgrade` re-runs the same provisioning hook every time (see "Hook
semantics" below), so ordinary config changes are just a `values.yaml`
edit + `helm upgrade`, not a separate manual signet step.

### kluster addon

Once published, this chart is installable the same way kluster installs
its other addons (postgres, clickhouse, traefik, signet-admin) -- see
kluster's own addon docs for the exact wiring. Tracked as follow-up work
(not yet wired as of this chart's first version).

### ArgoCD

Point an ArgoCD `Application` at this chart's repo/path with your own
`values.yaml` overlay (holding non-secret values) and a separately-managed
`Secret`/values reference for `hook.adminTokenSecretRef` and each service's
`secrets:` maps -- ArgoCD's own secret-management convention (e.g.
sealed-secrets, external-secrets, or an ApplicationSet parameter source) is
out of scope for this chart to prescribe; plug in whatever your ArgoCD
install already uses.

## `values.yaml` schema

### Chart-wide

| Key | Type | Description |
| --- | --- | --- |
| `imagePullSecretName` | string | Name of an already-existing image pull Secret, referenced by every service's Deployment. |

### `hook.*` -- the provisioning Job

| Key | Type | Description |
| --- | --- | --- |
| `hook.image.repository` / `.tag` / `.pullPolicy` | string | Hook container image, built from `hook/` in this repo. |
| `hook.signetAdminAddr` | string, required | signet's admin gRPC address (`GitOpsService`/`AdminService`), e.g. `signet-admin.signet.svc.cluster.local:8444`. |
| `hook.adminTokenSecretRef.name` / `.key` | string, required | Name/key of the operator-created Secret holding the signet operator bearer token (see Prerequisites). Not templated by this chart. |
| `hook.resources` | object | Requests/limits for the hook Job's single container. |

### `<service>.*` -- one subtree per service (`chronicle`, `herald`, `keep`, `lookout`, `portcullis`, `steward`, `tower`, `web`)

| Key | Type | Description |
| --- | --- | --- |
| `<service>.signet.addr` | string, required | signet's workload gRPC address. Used by the hook to target this service's namespace/service in signet, and rendered as `SIGNET_ADDR` in every service's own Deployment, activating its Signet-Configured Mode (ADR 0102). |
| `<service>.signet.adminAddr` | string | signet's admin gRPC address, for the services whose own code also calls `GitOpsService` directly (herald, keep, tower) -- rendered as `SIGNET_ADMIN_ADDR`. |
| `<service>.signet.trustDomain` | string, required | SPIFFE trust domain, rendered as `SIGNET_TRUST_DOMAIN`. |
| `<service>.signet.namespace` | string, required | The signet-side namespace this service's config/secrets live under -- also what the hook's `PutServiceConfig`/`SyncBundle` calls target. Rendered as `SIGNET_NAMESPACE`. |
| `<service>.image.repository` / `.tag` / `.pullPolicy` | string | Container image. |
| `<service>.replicas` | int | Deployment replica count. |
| `<service>.port` | int | Container port; also used for the Service and TCP liveness/readiness probes. |
| `<service>.resources` | object | Requests/limits. |
| `<service>.spiffe.socketValue` | string | Rendered as the SPIFFE Workload API socket env var, and mounts the `csi.spiffe.io` volume every service needs to dial signet's workload port. The env var name differs by service: `SPIFFE_SOCKET` (bare path) for portcullis, `SPIFFE_ENDPOINT_SOCKET` (`unix://`-prefixed URI) for the seven Node services -- see each `templates/<service>/deployment.yaml`. |
| `<service>.extraEnv` | list of `{name, value}` / `{name, valueFrom}` | Passthrough, merged verbatim into the container's `env`. This is where each service's plain-http inter-service URLs (`TOWER_URL`, `HERALD_URL`, `KEEP_BASE_URL`, ...), `NODE_TLS_REJECT_UNAUTHORIZED=0` workarounds, and chronicle/lookout's ClickHouse/RabbitMQ `secretKeyRef`-sourced credentials live -- kept as the Env-Only Mode fallback (ADR 0102: signet unconditionally overrides env once Signet-Configured Mode is active, so these become inert rather than conflicting once the hook has provisioned a real bundle). Defaults reproduce each service's currently-live env exactly -- override only what you need to change. |
| `<service>.config` | map | This service's plain config, pushed via the hook's `PutServiceConfig` call. Mirrors what this service's own signet bundle should contain per its own stories. |
| `<service>.secrets` | map | Same, for secret fields, pushed via the hook's `SyncBundle` call. |

**All eight services get `SIGNET_*` env + the SPIFFE CSI volume mount** in
their Deployment, per ADR 0104's decision to activate every service's
Signet-Configured Mode through this chart. `bytepunx/deploy`'s currently-live
manifests only wire four of the eight (herald, keep, portcullis, tower) --
the other four (chronicle, lookout, steward, web) already shipped
Signet-Configured Mode support in their own repos (ADR 0102/Stories 002, 003,
006, 012, all merged) but `deploy` was never updated to turn it on. This
chart intentionally does not perpetuate that staleness: until you've
populated real config/secrets in signet for chronicle/lookout/steward/web
(via `<service>.config`/`.secrets` here, or independently), their pods will
fail loud on startup per ADR 0102's "missing bundle field = fail loud, not
fall back" rule -- populate their bundle content before installing this
chart against a namespace that runs them. (The Deployment templates render
`SIGNET_ADDR` unconditionally; there is currently no chart-level toggle back
to Env-Only Mode for these four -- that would need each template's
`SIGNET_*` block wrapped in an `if`, not implemented here since ADR 0104
doesn't call for it.)

### Secrets in `values.yaml`

Passing secret values through Helm `values` (even from a separate
`values-secrets.yaml` you don't commit) is a known weak point: plaintext
secret material transits `helm install`/`upgrade`'s process memory and,
depending on your Helm version/backend, may land in the stored release
object. This chart accepts that tradeoff for now, matching how kluster's
other addons take credentials today, rather than introducing a second
secret-reference mechanism (sealed-secrets, external-secrets, ...) -- treat
`values-secrets.yaml` (or however you supply `<service>.secrets` and
`hook.adminTokenSecretRef`'s backing token) the same way you'd treat any
other plaintext secret material, and revisit this as a follow-up ADR if it
becomes a real operational concern for your deployment.

## Hook semantics (pre-install / pre-upgrade)

The `templates/hook-job.yaml` Job is annotated
`helm.sh/hook: pre-install,pre-upgrade` and runs before Helm applies any of
the eight services' own `Deployment`/`Service`/`ServiceAccount` resources.
`helm.sh/hook-failure-policy` is left unset (Helm's default): a failed hook
fails the whole release with no custom recovery path.

For each service, **in a fixed order** (chronicle, herald, keep, lookout,
portcullis, steward, tower, web), the hook:

1. Calls `GetServiceConfig` to learn the current config document's version
   (`0` if none exists yet), then `PutServiceConfig` with that
   `expectedVersion` -- create-or-replace.
2. If that service has any `secrets:` entries, calls `GetSOPSPublicKey`,
   SOPS-encrypts each secret value client-side, and calls `SyncBundle` to
   push them.

**Idempotent and safe to retry:** both calls are independently
idempotent per service, so re-running the whole hook (a retried
`helm upgrade`, or a fresh `helm upgrade` after fixing a config error) is
always safe and self-heals config drift. Already-succeeded services from a
prior failed run are not rolled back.

**Fail-fast:** on the first failing call for any service, the hook logs
which service and which call failed, stops immediately (does not attempt
remaining services), and exits non-zero -- which Helm surfaces as a failed
release.

**Inputs:** the hook reads two mounted JSON documents templated by this
chart from `values.<service>.config` / `values.<service>.secrets` --
`templates/hook-configmap.yaml`'s `config.json` (plain config; a
ConfigMap) and `templates/hook-secret.yaml`'s `secrets.json` (secret
values; a Secret, not a ConfigMap, so at-rest it's at least base64-encoded
rather than plaintext in a ConfigMap -- see "Secrets in `values.yaml`"
above for the caveat that doesn't fully resolve).

**Auth:** the hook authenticates to signet as an operator, via
`dialAdmin`/`gitOpsClient({ address: values.hook.signetAdminAddr, token,
plaintext: true })` -- `plaintext: true` because signet's in-cluster admin
listener is plaintext-behind-bearer-token today, not TLS-terminated (see
`@bytepunx/signet-client`'s README). The token comes from the Secret
referenced by `values.hook.adminTokenSecretRef`.

## Development

### Chart

```
helm lint .
helm template . \
  --set hook.signetAdminAddr=signet-admin.signet.svc.cluster.local:8444 \
  --set hook.adminTokenSecretRef.name=signet-admin-token \
  --set hook.adminTokenSecretRef.key=token
```

### Hook (`hook/`)

```
cd hook
npm install
npm run build       # tsc
npm run typecheck   # tsc --noEmit
npm test            # vitest run -- 19 unit tests, hand-written fakes, no real network
```

## `manifest.json` -- what each service needs, before you fill in `values.yaml`

Per [ADR 0105](../design/adrs/0105-signet-manifest-and-aggregated-onboarding-spec.md),
services opt in to shipping a `signet-manifest.json` in their own repo, embedded at
`/signet-manifest.json` in their published image -- a schema (field names, `config` vs `secret`,
required, derivable) of what that service needs in signet, never actual values.
`tools/aggregate-manifest.mjs` extracts every onboarded service's manifest straight from the
exact image `values.yaml` references (no local Docker daemon, no source checkout needed) and
merges them into the committed `manifest.json` at this chart's root. A service that hasn't
adopted the manifest yet is skipped with a warning, not a hard failure -- rollout across the 8
services is incremental (lookout is the pilot; see Story 003 in `authstar-design`).

**Prerequisites:** [`crane`](https://github.com/google/go-containerregistry/tree/main/cmd/crane)
and [`yq`](https://github.com/mikefarah/yq) on your `PATH`, plus registry credentials for any
private image (`docker login`/`crane auth login` -- `crane` reads the same `~/.docker/config.json`
credential store `docker` does).

```
node tools/aggregate-manifest.mjs           # regenerate manifest.json
node tools/aggregate-manifest.mjs --check   # exit 1 if manifest.json is stale (CI)
```

CI re-runs the `--check` form on every push and fails if `manifest.json` doesn't match what the
images `values.yaml` currently references actually declare -- bumping any service's `image.tag`
that changed its manifest requires regenerating and committing `manifest.json` in the same PR.
There's no wizard yet that reads this file to walk an operator through populating
`values.<service>.config`/`.secrets` -- that's tracked as separate follow-on work in the `signet`
project itself (ADR 0105), not this chart. For now, `manifest.json` is a single, trustworthy,
CI-verified place to look up what a service needs, in place of reading its source.
