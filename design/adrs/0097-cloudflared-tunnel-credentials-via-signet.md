---
id: ADR-0097
title: cloudflared Tunnel Credentials via Signet + kickr
status: accepted
date: 2026-08-23
updated: 2026-09-23
supersedes: []
superseded_by: []
---
# ADR 0097: cloudflared Tunnel Credentials via Signet + kickr

- **Status:** Accepted
- **Date:** 2026-08-23
- **Affects:** infra (`bytepunx/deploy`, new `bytepunx/cloudflared-kickr`)
- **Refines:** [ADR 0010](0010-kickr-for-rabbitmq-container.md)

## Context

cloudflared's tunnel credentials were delivered as a KSOPS-encrypted Kubernetes Secret,
hand-committed to `bytepunx/deploy`. Discovered while debugging an unrelated portcullis routing
issue: the secret's value was corrupted (66 bytes of base64 — a real tunnel credentials JSON is
200-400+ bytes), and had been since at least 2026-04-21 (the encrypted file's own `lastmodified`
timestamp) — a real, standing outage risk that went completely undetected because the tunnel's
two long-running pods (123 days old) had each already loaded a *good* copy into memory at their
own startup and never needed to re-read the file since. Attempting to restart the deployment to
pick up an unrelated config change surfaced it immediately: the new pod crash-looped on invalid
JSON. Had either of the two existing pods ever needed to restart for any ordinary reason (node
drain, OOM, a Kubernetes upgrade), the entire tunnel — all of `bytepunx.com`'s real traffic —
would have gone down with no warning.

## Decision

Replace the Kubernetes Secret entirely with signet, using the exact pattern ADR 0010 already
established for RabbitMQ: [`bytepunx/kickr`](https://github.com/bytepunx/kickr) wraps the
signet-unaware third-party binary (`cloudflared`, previously `rabbitmq-server`) as its container
entrypoint, fetching the workload's signet bundle at every startup and injecting it into the
child's environment.

### `bytepunx/cloudflared-kickr` (new repo)

A composite image: `FROM cloudflare/cloudflared:latest`, with kickr's binary copied in from
`bytepunx/kickr:latest` and set as `ENTRYPOINT`. `KICKR_COMMAND`/`KICKR_ARGS` (set on the
Deployment, not baked into the image) tell kickr to exec `cloudflared tunnel --no-autoupdate
--config /etc/cloudflared/config/config.yaml run` — the exact same invocation the plain image
used, unchanged.

### The secret: `tunnel-token`

Pushed to signet at `cloudflare/cloudflared/tunnel-token` (`bytepunx/cluster-secrets`) — a fresh
token issued from the Cloudflare dashboard for the same existing tunnel (Zero Trust → Networks →
Tunnels → Configure), rather than the original `cloudflared tunnel create`-issued
`credentials.json`, which was never recovered. kickr's own env-var-normalisation
(`internal/bundle/bundle.go`: uppercase, non-alphanumeric → underscore) turns this into
`TUNNEL_TOKEN` — which `cloudflared` reads natively via its own `$TUNNEL_TOKEN` support (confirmed
directly against `cloudflared tunnel run --help`). This is the key property that makes the whole
approach work with zero file-writing: kickr's own design is deliberately environment-variable-only
(no file-writing path exists), which would otherwise be a hard blocker — cloudflared's *own*
support for token-based (or, equivalently, `--credentials-contents`/`$TUNNEL_CRED_CONTENTS`
content-string-based) authentication is what closes the gap, not any change to kickr. Token-based
auth composes cleanly with the existing locally-managed `config.yaml` ingress rules (unchanged) —
it replaces only the tunnel's *authentication*, not where routing rules live.

Keeps the existing locally-managed tunnel model (`config.yaml` with `ingress:` rules, committed to
`bytepunx/deploy`, unchanged) rather than migrating to Cloudflare's remotely-managed
(dashboard/API-driven) tunnel routing — only the credentials delivery path changes.

### Why this fixes the actual failure mode, not just the symptom

The old failure mode was "a bad value can sit in a Kubernetes Secret indefinitely with nothing
ever re-checking it, because the *live, running* pods have no reason to re-read it." kickr fetches
this secret fresh on **every single startup**, with no equivalent long-lived caching — a bad value
now fails the very next pod (or replica) that starts, immediately and loudly, instead of hiding
until some unrelated future restart.

## Consequences

- **New repo**: `bytepunx/cloudflared-kickr` — Dockerfile, GitHub Actions build/publish (amd64
  only, matching the same iteration-speed tradeoff made for portcullis's own CI during this same
  session — arm64 can be added back later if a real need arises).
- **`bytepunx/deploy`**: `apps/cloudflare-tunnel/` gains a dedicated `cloudflared` ServiceAccount,
  a `cloudflared-kickr-config` ConfigMap (`.kickr.yaml`: `namespace: cloudflare, service:
  cloudflared`), and the SPIFFE CSI volume; `apps/spire-registrations/cluster-spiffe-id.yaml`
  gains a matching `ClusterSpiffeID`. The KSOPS-encrypted credentials file, its `ksops.yaml`
  generator, and the Secret volume mount are removed.
- **`bytepunx/cluster-secrets`**: needs `cloudflare/cloudflared/tunnel-token` pushed with a real
  tunnel token before the new deployment spec is safe to roll out — until then, the old
  (corrupted) Secret path is left in place as the live configuration, deliberately not pushed, so
  the two currently-working pods are never disturbed by an incomplete migration.
- Establishes `bytepunx/cloudflared-kickr` as the second real-world instance (after
  `bytepunx/rabbitmq-kickr`) of ADR 0010's general pattern — wrapping a signet-unaware
  third-party binary in kickr — worth reusing again for any future third-party binary that reads
  its own secrets from a single environment variable or content string.

## Related

- [ADR 0010](0010-kickr-for-rabbitmq-container.md) — the RabbitMQ precedent this mirrors
- `~/git/kickr/design/draft.md`
