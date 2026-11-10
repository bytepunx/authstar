---
id: T-0107
type: task
nature: remediation
title: "A TLS front serves authstar.<acme's domain> in-cluster from portcullis with a harness CA"
status: backlog
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:55:58Z
updated: 2026-11-09T20:55:58Z
transitions: []
stream: S-0017
tags: [integration]
touches: [integration/scripts/harness-tls.sh, integration/manifests/02-coredns-custom.yaml, integration/manifests/18-authstar-tls.yaml, integration/scripts/deploy.sh]
---
# T-0107 A TLS front serves authstar.<acme's domain> in-cluster from portcullis with a harness CA

## Work

Criterion 1. Chronicle fetches `https://authstar.<domain>/.well-known/jwks.json`, but portcullis listens plain HTTP on 3710 and nothing in `integration/` terminates TLS or maps that host in-cluster.

- Write `integration/scripts/harness-tls.sh`, POSIX `sh` under `set -eu`. It makes a harness CA and a leaf cert whose DNS SAN is `authstar.<acme's domain>`, with `openssl` in a temporary directory, and loads them with `kubectl apply` as a TLS Secret for the front and a ConfigMap holding the CA alone, in the `authstar` namespace. It is idempotent: it keeps a CA that exists. No key goes into the repository.
- Write `integration/manifests/18-authstar-tls.yaml`: a small TLS-terminating proxy (a Deployment, its config, and a Service on 443) that serves the leaf cert and proxies to `portcullis.authstar.svc.cluster.local:3710`, passing `Host` through.
- Write `integration/manifests/02-coredns-custom.yaml`: the k3s `coredns-custom` ConfigMap in `kube-system` with a rewrite of `authstar.<acme's domain>` to the front's Service name.
- Change `integration/scripts/deploy.sh` to run `harness-tls.sh` and apply both manifests; its glob `1[0-7]-*.yaml` leaves them out.

The domain is the one the step-1 task gives `acme`; agree it with that task first (`acme.authstar.app` fits the hosts `portcullis.yaml` already serves). This task waits for no task.

## Done when

- `deploy.sh` runs the script and applies both manifests, and running it twice changes nothing.
- `sh -n` and `shellcheck` pass on both scripts, and `kubectl apply --dry-run=client` accepts both manifests.
- On a running harness, run by the operator (D-0026), `curl --cacert <the CA> https://authstar.<domain>/.well-known/jwks.json` from a pod answers acme's key set.

## Notes
