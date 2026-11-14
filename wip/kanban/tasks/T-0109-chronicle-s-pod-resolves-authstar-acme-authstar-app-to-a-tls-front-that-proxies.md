---
id: T-0109
type: task
nature: remediation
title: Chronicle's pod resolves authstar.acme.authstar.app to a TLS front that proxies to portcullis, and trusts the harness CA
status: done
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:56:14Z
updated: 2026-11-13T21:45:13Z
transitions:
  - to: ready
    at: 2026-11-13T21:42:03Z
    by: agent-S-0017
  - to: in-progress
    at: 2026-11-13T21:42:03Z
    by: agent-S-0017
  - to: done
    at: 2026-11-13T21:45:13Z
    by: agent-S-0017
stream: S-0017
tags: [integration, chronicle]
touches: [integration/manifests/14-chronicle.yaml, integration/config/authstar/chronicle.yaml]
usage:
  source: log
  seconds: 190
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 21
      output: 7345
      cache_read: 2719585
      cache_write: 53421
      cost: 1.012
---
# T-0109 Chronicle's pod resolves authstar.acme.authstar.app to a TLS front that proxies to portcullis, and trusts the harness CA

## Work

Criteria 1 and 3.

- `integration/manifests/14-chronicle.yaml`:
  - `hostAliases` maps `authstar.acme.authstar.app` to `127.0.0.1` in chronicle's pod.
  - A sidecar container `tls-front`, on chronicle's own image (no new image), runs a small Node script from a ConfigMap in the same file: it listens on `127.0.0.1:443` with `tls.crt` and `tls.key` from Secret `authstar-tls` (T-0107) and proxies every request to `http://portcullis:3710`, keeping `Host`, path, method, headers, and body. A pod-level `sysctls` `net.ipv4.ip_unprivileged_port_start=0` lets the image's `node` user bind 443.
  - The chronicle container mounts the Secret's `ca.crt` and sets `NODE_EXTRA_CA_CERTS` to it. `NODE_TLS_REJECT_UNAUTHORIZED=0` stays as I-0001 records it; nothing adds another.
  - Nothing names namespace `authstar` in a way `kluster_render` (`scripts/lib-kluster.sh`) cannot rename: the short Service name `portcullis` resolves in the pod's own namespace.
- `integration/config/authstar/chronicle.yaml`: the comment says how chronicle reaches tower and the JWKS host now.

Runs beside T-0107: the contract is the Secret `authstar-tls` with keys `ca.crt`, `tls.crt`, `tls.key`.

## Done when

- The manifest parses as YAML (a `kubectl` dry run is a cluster command) and renders through `kluster_render` with no `authstar` namespace left in it.
- The front's script, run locally under `bin/S-0017/` against a scratch cert on a high port and a stub upstream, proxies a request keeping `Host`.

## Notes
