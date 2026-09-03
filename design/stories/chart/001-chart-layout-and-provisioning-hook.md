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
- [ ] `templates/<service>/deployment.yaml`, `templates/<service>/service.yaml` exist for each of
      the eight services, one subtree per service under `values.<service>.*`.
- [ ] Each service's `Deployment` sets `SIGNET_ADDR`, `SIGNET_TRUST_DOMAIN`, `SIGNET_NAMESPACE`
      (and any other bootstrap coordinate that service's stories already require, e.g.
      `SPIFFE_WORKLOAD_SOCKET`) from `values.<service>.signet.*`, plus `image.repository`/
      `image.tag`/`replicas`/resource requests from `values.<service>.*`. No other env var is
      templated by the chart — every non-bootstrap setting comes from the signet bundle the hook
      provisions, per ADR 0102's Signet-Configured Mode.
- [ ] The chart does not template anything for signet itself (no signet `Deployment`/`Service`) —
      `values.yaml` only ever references an already-running signet via its bootstrap coordinates.

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
