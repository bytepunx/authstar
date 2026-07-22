# Story 001 — Configuration and Secrets via Signet

**Epic:** Configuration
**Repo:** portcullis
**Status:** Draft
**Supersedes:** `ref-design` Stories 001 (YAML config) and 002 (env overrides) — see Notes.

---

## Summary

Portcullis takes all configuration and secrets from signet. There is no local YAML config
file and no environment-variable override chain for tenant or operational settings — the
entire "defaults → YAML → ENV" precedence model from the reference design is replaced by
signet's git-native config/secrets delivery (ADR 0004).

---

## Background

See [ADR 0004](../../decisions/0004-signet-for-configuration-and-secrets.md) (hard signet
dependency), [ADR 0007](../../decisions/0007-signet-tenant-namespace-mapping.md) (per-tenant
namespace convention), [ADR 0013](../../decisions/0013-tenant-discovery.md) (tenant discovery),
and [ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md)
(per-tenant, per-purpose signing keys).

---

## Acceptance Criteria

### Bootstrap (minimal, ENV-configured)

- [ ] The only environment-configured values are what portcullis needs to reach signet at all,
      before any bundle can be fetched:

  | Variable | Required | Description |
  |---|---|---|
  | `SIGNET_ADDR` | Yes | signet workload gRPC address |
  | `SIGNET_SPIFFE_ID` | One of this or `SIGNET_TRUST_DOMAIN` | signet's exact SPIFFE ID; pins the server identity portcullis accepts over mTLS (recommended — see kickr's identical `KICKR_SIGNET_SPIFFE_ID` precedent) |
  | `SIGNET_TRUST_DOMAIN` | One of this or `SIGNET_SPIFFE_ID` | Weaker fallback — accepts any peer in the trust domain as signet |
  | `SPIFFE_SOCKET` | No, default `/run/spire/sockets/agent.sock` | SPIRE agent workload API socket path |

- [ ] A missing/invalid required bootstrap variable is a startup failure with a clear error —
      not a silently-applied default, consistent with kickr's own posture on security-relevant
      config.
- [ ] Portcullis embeds the Rust `signet-client` crate directly (no kickr wrapper — see ADR
      0004's note that Rust services embedding the client don't need a process-host sidecar).

### Own service bundle

- [ ] At startup, portcullis calls `GetServiceBundle` for its own scope
      (`ns/authstar/sa/portcullis`). This bundle's config includes the tenant discovery
      document (ADR 0013) — the list of active tenants and their hostnames. It is not expected
      to contain meaningful secrets of its own, since portcullis has no direct database/cache
      access (ADR 0004).
- [ ] Portcullis opens a `WatchServiceBundle` stream on its own scope and reacts to a change via
      the standard coordinated-restart cycle (`AcquireRestartLock` → refetch on next process
      start).

### Per-tenant bundles

- [ ] For every tenant listed in the discovery document, portcullis calls `GetServiceBundle` on
      that tenant's namespace (`ns/tenant-<slug>/sa/portcullis`) to obtain its operational
      config (providers, CORS origin, cookie domain, upstream routing, exempt list) and its two
      signing keypairs (session, internal — ADR 0002).
- [ ] Portcullis opens a `WatchServiceBundle` stream per tenant and reacts to a change via the
      coordinated-restart cycle, scoped so that one tenant's bundle change does not force a
      restart cycle for unrelated tenants' traffic where avoidable.
- [ ] When the tenant discovery document adds or removes a tenant, portcullis starts or stops
      watching that tenant's bundle at runtime — no full portcullis restart is required merely
      because a tenant was added or removed.

### Config shape

- [ ] The non-secret config shape for a tenant's bundle mirrors the original reference sections
      (`server`, `upstream`, `exempt`, `auth`, `cookie`, `cors`, `providers`) — the schema
      itself largely survives, per ADR 0011; only the source and per-tenant scoping change.
      `jwt` key-file-path fields are removed — keys arrive as secrets in the bundle, not file
      paths (see Story 008).
- [ ] The `providers` config continues to use insertion-order-preserving structures so provider
      listings (Story 017) and the selection page (Story 018) render in a stable, operator-
      defined order.

---

## Notes

- This story supersedes `ref-design`'s Story 001 (`AUTHSTAR_CONFIG_PATH`, static YAML) and
  Story 002 (the `defaults → YAML → ENV` override chain, including all the per-key ENV var
  tables). Signet's git-reviewed config *is* the override mechanism now; runtime environment
  variables are reserved for the minimal bootstrap surface above only.
- Do not log secret bundle contents (signing keys, provider client secrets) at any log level —
  the same constraint the original Story 001 stated for JWT private keys applies to everything
  arriving via signet now.
- `ref-design` Story 002's warning against `AUTHSTAR_PORT`/`PORT` (Kubernetes may inject
  non-numeric values) no longer applies in the same way, since `server.port` is now tenant
  config delivered via signet rather than an ENV var — but the underlying lesson (don't trust
  ambient ENV vars for security- or routing-relevant settings) is exactly why the bootstrap
  surface above is kept intentionally minimal.
