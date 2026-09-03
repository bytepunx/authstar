# Story 001 — Chart Layout and Signet-Provisioning Hook

**Epic:** Deployment
**Repo:** authstar-chart
**Status:** Draft
**Per:** [ADR 0104](../../decisions/0104-helm-chart-and-provisioning-hook.md)

---

## Summary

A single Helm chart deploys all eight authstar services (chronicle, herald, keep, lookout,
portcullis, steward, tower, web) and, via a `pre-install,pre-upgrade` hook Job, provisions each
service's plain config (`PutServiceConfig`) and secrets (`SyncBundle`) in signet before the
services' own pods start.

---

## Acceptance Criteria

### Chart layout

- [ ] `Chart.yaml` declares the chart; `values.yaml` provides defaults for every value below.
- [ ] `templates/<service>/deployment.yaml`, `templates/<service>/service.yaml`,
      `templates/<service>/serviceaccount.yaml` exist for each of the eight services, one subtree
      per service under `values.<service>.*`. Each service gets its own `ServiceAccount` named
      exactly the service name (chronicle, herald, keep, lookout, portcullis, steward, tower,
      web) — SPIRE's `ClusterSpiffeID` registration derives
      `spiffe://<trust-domain>/ns/<namespace>/sa/<service-account>` from this literal pairing
      (matching `bytepunx/deploy`'s current `authstar-platform/serviceaccounts.yaml`); the
      namespace default `ServiceAccount` must never be used.
- [ ] Each service's `Deployment` sets `SIGNET_ADDR`, `SIGNET_TRUST_DOMAIN`, `SIGNET_NAMESPACE`
      (and any other bootstrap coordinate that service's stories already require, e.g. tower's/
      herald's/keep's `SIGNET_ADMIN_ADDR` for their own admin-port GitOps calls, or portcullis's
      bare-path `SPIFFE_SOCKET` vs. the Node services' `unix://`-prefixed
      `SPIFFE_ENDPOINT_SOCKET` — mirror `bytepunx/deploy/apps/authstar-platform/*/deployment.yaml`
      exactly per service rather than assuming one shared env var set) from `values.<service>.signet.*`,
      plus `image.repository`/`image.tag`/`replicas`/resource requests/liveness+readiness TCP
      probes from `values.<service>.*`. **All eight services get bootstrap coordinates rendered
      into their own Deployment env**, activating Signet-Configured Mode chart-wide (ADR 0104) —
      including chronicle, lookout, steward, and web, whose own repos already shipped
      Signet-Configured Mode support (ADR 0102/Stories 002, 003, 006, 012) even though
      `bytepunx/deploy`'s live manifests never turned it on; this chart is the vehicle that
      finally does. Every service still keeps its plain-http inter-service URLs (`TOWER_URL`/
      `TOWER_BASE_URL`/`HERALD_URL`/`KEEP_BASE_URL`) and the `NODE_TLS_REJECT_UNAUTHORIZED=0`
      workaround those calls currently require against tower's SPIFFE-mTLS-only server (no CA
      trust wiring on the caller side yet) as `values.<service>.extraEnv` (a passthrough list
      merged into the container's `env`, not specially templated) — inert once signet overrides
      them (ADR 0102), but left as the Env-Only Mode fallback rather than deleted, so the chart
      doesn't hardcode a workaround that's really an application-level gap tracked elsewhere.
      Every service also needs `imagePullSecrets: [{name: dockerhub-credentials}]`
      (`values.imagePullSecretName`, chart-wide default) and, since every service dials signet
      once activated, the `csi.spiffe.io` SPIFFE volume mount at `/run/spire/sockets`.
- [ ] The chart does not template anything for signet itself (no signet `Deployment`/`Service`) —
      `values.yaml` only ever references an already-running signet via its bootstrap coordinates.
- [ ] The chart does not template a `Namespace` — matching `bytepunx/deploy`'s
      `authstar-platform/namespace.yaml` being separate from its per-service kustomizations, the
      target namespace is assumed to already exist (or is created by the operator/kluster addon
      wiring, out of scope for this chart).

### Provisioning hook

- [ ] A `Job` template annotated `helm.sh/hook: pre-install,pre-upgrade` and
      `helm.sh/hook-weight: "0"` runs a single container, built from this repo's `hook/` TS
      project, before any service `Deployment` is applied (services' hook weight, if any, is
      higher, or hooks run before non-hook resources regardless per Helm's ordering — confirm
      against the Helm version in use rather than relying on weight alone).
- [ ] `helm.sh/hook-failure-policy` is unset (Helm's default) — Helm's own release-failure
      behavior on a failed hook applies unchanged; this story doesn't invent a custom recovery
      path.
- [ ] The hook authenticates via `dialAdmin({ address, token })` using
      `@bytepunx/signet-client` 0.9.0, where `address` is `values.hook.signetAdminAddr` and
      `token` is read from a Kubernetes `Secret` the operator creates beforehand, referenced by
      `values.hook.adminTokenSecretRef.{name,key}` — the chart does not template or generate this
      `Secret`.
- [ ] The hook's input (which config/secret values to push for each of the 8 services) is a
      single JSON document, templated by the chart from `values.<service>.config` /
      `values.<service>.secrets` into a `ConfigMap` (config) and reads secrets directly from
      `values` (Helm values are not a secure secret store by default — see Notes) mounted into
      the hook container.
- [ ] For each service, in a fixed order (chronicle, herald, keep, lookout, portcullis, steward,
      tower, web), the hook: (1) calls `PutServiceConfig` for that service's namespace/service
      with the templated config content, using `GetServiceConfig`'s current `version` as
      `expectedVersion` if a document already exists, or `0` if this is a first-time create; (2)
      calls `SyncBundle` to push that service's secrets, SOPS-encrypting with the key from
      `GetSOPSPublicKey`.
- [ ] On the first per-service failure (either call erroring), the hook logs which service and
      which call failed, stops immediately (does not attempt remaining services), and exits
      non-zero — causing Helm to mark the release failed. Already-succeeded services' pushes are
      not rolled back (`PutServiceConfig`/`SyncBundle` are independently idempotent per service,
      so re-running the whole hook on a retried `helm upgrade` is safe and self-heals).
- [ ] On success for all 8 services, the hook exits 0 and logs a per-service summary
      (service name, config version written, whether secrets changed).

### values.yaml schema

- [ ] `values.hook.signetAdminAddr` (string, required), `values.hook.adminTokenSecretRef.name` /
      `.key` (required).
- [ ] `values.<service>.signet.{addr,trustDomain,namespace}` (required per service),
      `values.<service>.image.{repository,tag}`, `values.<service>.config` (arbitrary map — this
      service's plain config, mirrors what its signet bundle should contain per its own stories),
      `values.<service>.secrets` (arbitrary map — same, for secret fields).

---

## Notes

- Passing secret values through Helm `values` (even from a separate `values-secrets.yaml` not
  committed to git) is a known weak point — plaintext secret material transits `helm
  install`/`upgrade`'s process memory and, depending on the Helm version/backend, may land in the
  stored release object. This story accepts that tradeoff for now (matching how kluster's other
  addons take credentials today) rather than introducing a second secret-reference mechanism
  (e.g. sealed-secrets, external-secrets) — revisit as a follow-up ADR if this becomes a real
  operational concern, not silently absorbed into this story's scope.
- `PutServiceConfig`'s optimistic-concurrency `expectedVersion` means a second, concurrent
  `helm upgrade` racing this hook could `ABORTED`-fail on a version mismatch — acceptable for a
  hook that only ever runs as part of a single release's install/upgrade lifecycle (Helm itself
  serializes hook execution within one release), not designed for concurrent multi-release
  provisioning of the same services.
- Chart versioning/publishing (Helm repo index, OCI registry, or git-only) and the kluster addon
  wiring itself are out of scope for this story — tracked as follow-up work once the chart and
  hook exist and are verified against a real cluster.
