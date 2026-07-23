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
dependency), [ADR 0014](../../decisions/0014-single-bundle-prefixed-tenant-keys.md) (single
bundle, prefixed tenant keys — supersedes the earlier per-tenant-namespace design in ADR 0007/
0013), [ADR 0002](../../decisions/0002-multi-tenant-architecture-and-key-management.md)
(per-tenant, per-purpose signing keys), and
[ADR 0016](../../decisions/0016-application-layer-and-sso-scope.md) (application layer nested
inside tenant — a tenant is a customer/company; an application is one of that tenant's
products, e.g. one of several related sites sharing a login).

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

### The single bundle

- [ ] Portcullis has exactly one signet scope: `ns/authstar/sa/portcullis`. There is no
      per-tenant namespace and no wildcard cross-namespace policy (ADR 0014).
- [ ] At startup, portcullis calls `GetServiceBundle` once for this scope and opens one
      `WatchServiceBundle` stream on it. Any change — a new tenant, a rotated key, an updated
      provider list, anything — is picked up through the single, standard coordinated-restart
      cycle (`AcquireRestartLock` → refetch on next process start). No per-tenant watch is ever
      opened or torn down at runtime.
- [ ] The bundle's plain config has a top-level `tenants` map, keyed by tenant slug. Each
      tenant entry holds what must be **shared across every one of its applications** (ADR
      0016): `providers` (credentials — `clientId`/`clientSecret`/`discoveryUrl`/`scope`) and
      `cookie` (`domain`/`path`/`maxAge`/`httpOnly`/`secure`). `jwt` key-file-path fields are
      removed entirely — keys arrive as secrets, not file paths (see Story 008).
- [ ] Each tenant entry has a nested `applications` map, keyed by application slug. Each
      application entry holds what's specific to that one product: `hosts`, `server.publicUrl`,
      `upstream` (base, routes, timeout), `cors.origin`, `exempt`, `auth.loginUrl`, and which of
      the tenant's providers this application exposes (a name list referencing the tenant-level
      `providers` map, optionally with per-application `loginPath`/`callbackPath` overrides —
      still defaulting to `/oauth2/{name}/login` and `/oauth2/{name}/callback` if unset).
- [ ] The bundle's `secrets` map holds each tenant's two signing keys (session, internal — ADR
      0002) under `tenant-<slug>-session-key` / `tenant-<slug>-internal-key` naming — flat,
      prefixed names, scoped to the tenant, not to any one application.
- [ ] The `tenants.<slug>.providers` map, and each application's list of exposed provider
      names, continue to use insertion-order-preserving structures so provider listings (Story
      017) and the selection page (Story 018) render in a stable, operator-defined order.
- [ ] Removing an application's entry from its tenant's `applications` map (full
      deletion/offboarding) is what stops portcullis from recognizing its hostname(s). A merely
      *suspended* tenant or application stays in the map; suspension is enforced per-request
      through the normal enrichment `Deny` outcome (ADR 0001/0003), not by removing proxy-level
      routing — unchanged in spirit from the earlier tenant-only version of this rule, now
      applying at the application level too.

## Example Shape

```yaml
tenants:
  acme:
    providers:
      google: { clientId: "...", clientSecret: "...", discoveryUrl: "https://accounts.google.com" }
    cookie:
      domain: .acme.example.com
      path: /
      maxAge: 604800
      httpOnly: true
      secure: true
    applications:
      math:
        hosts: [math.acme.example.com]
        server: { publicUrl: https://math.acme.example.com }
        upstream: { base: http://math-svc:4411 }
        providers: [google]
      cooking:
        hosts: [cooking.acme.example.com]
        server: { publicUrl: https://cooking.acme.example.com }
        upstream: { base: http://cooking-svc:4412 }
        providers: [google]
```

Both applications share `acme`'s provider credentials, signing keys, and cookie domain — a
session minted on `math.acme.example.com` is valid on `cooking.acme.example.com` because the
cookie's `Domain` is `.acme.example.com` and both hostnames fall under it (ADR 0016).

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
