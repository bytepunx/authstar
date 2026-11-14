---
id: TH-0035
title: "Plan for S-0017: five tasks in four layers; criterion 4 needs a harness run by you"
anchor:
  path: wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md
  item: S-0017
status: answered
participants: [planner-S-0017, bytepunx, agent-S-0017]
created: 2026-11-09T20:57:11Z
updated: 2026-11-13T21:41:50Z
---

# TH-0035 Plan for S-0017: five tasks in four layers; criterion 4 needs a harness run by you

On wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md.

## Entries

### 2026-11-09T20:57:11Z planner-S-0017
S-0017 is planned: five draft tasks in four layers, 4h forecast, cost of delay 30.00 USD a week. No earlier plan or thread existed, so this is the first plan. Nothing here needs an answer before the story is finalized.

## Tasks and layers

| Layer | Task | Touches |
|-------|------|---------|
| 1 | T-0107 A TLS front serves `authstar.<acme's domain>` in-cluster from portcullis with a harness CA | `integration/scripts/harness-tls.sh`, `integration/manifests/02-coredns-custom.yaml`, `integration/manifests/18-authstar-tls.yaml`, `integration/scripts/deploy.sh` |
| 1 | T-0108 Step 1 gives acme a domain, and portcullis resolves `authstar.<domain>` and a chronicle application for acme | `integration/scripts/scenario-golden-path.sh`, `integration/config/authstar/portcullis.yaml` |
| 2 | T-0109 Chronicle trusts the harness CA for the JWKS host (after T-0107: mounts its CA ConfigMap) | `integration/manifests/14-chronicle.yaml`, `integration/config/authstar/chronicle.yaml` |
| 3 | T-0110 Step 6 reads the auth-funnel report through portcullis with step 2's cookie (after T-0108: same script and the chronicle host; after T-0109: the read cannot pass without trust) | `integration/scripts/scenario-golden-path.sh` |
| 4 | T-0111 README drops the gap and documents the TLS front; I-0007 closed once criterion 4 passes (after T-0110) | `integration/README.md`, I-0007, `design/issues/summary.md` |

## Figures

- Forecast 4h, raised from flai's 18m (its median of 66 s per size unit fits no TLS and DNS work proven on a live cluster).
- Cost of delay 30.00 USD a week: S-0017's 4h share of E-0003's 75.00 USD a week, from your epic inputs. It stands as flai worked it out.
- No `after`. S-0010 and S-0019 share some files; the trial merge judges those.

## Assumptions

1. acme's domain is `acme.authstar.app`, so the JWKS host is `authstar.acme.authstar.app` and portcullis's existing hosts fit under it.
2. The TLS front is a small proxy in the harness with a self-signed CA made at deploy time, plus a k3s `coredns-custom` rewrite. Portcullis stays plain HTTP and no key is committed.
3. Chronicle trusts the CA through `NODE_EXTRA_CA_CERTS`. Its existing `NODE_TLS_REJECT_UNAUTHORIZED=0` (I-0001, S-0015) stays as it is, and T-0109 proves the CA alone makes the cert trusted.
4. Tower's code is out of scope. Setting the domain makes tower's `patchConfig` replace the whole `acme` tenant in portcullis: it sets the cookie `secure: true` and points web at namespace `authstar-platform`. If that breaks step 2 or drops the chronicle application, T-0108 asks you here rather than changing tower.
5. Criterion 4 needs a running harness. Agents on this host run no cluster commands (D-0026), and the harness config reaches the cluster only through signet's sync from `bytepunx/authstar-integration` (D-0034). You run step 6, or allow the story's agent to as on TH-0031. Until then, criterion 4 stays unticked and I-0007 stays open.
6. Closing I-0007 (T-0111) is not in the criteria. I added it because S-0017 remediates I-0007. Say if you want it dropped.

## Proposals

None. I would not split the story: the five tasks share one live proof.

### 2026-11-13T21:41:08Z bytepunx
Resolved.

### 2026-11-13T21:41:50Z agent-S-0017
I reviewed the plan and changed the design in two places.

1. **The TLS front goes inside chronicle's own pod.** It is a sidecar on chronicle's image, reached through `hostAliases`, with no CoreDNS rewrite. Story namespaces share one kluster, and a cluster-wide rewrite of `authstar.acme.authstar.app` can point at only one of them. `02-coredns-custom.yaml` and `18-authstar-tls.yaml` are gone. T-0107 now makes the CA and the `authstar-tls` Secret in both deploys, `scripts/kluster-deploy.sh` included. T-0109 now builds the sidecar and the CA trust, and runs beside T-0107.
2. **Step 2 must redeem the first-admin invite.** Chronicle requires `analytics:read`, and a login gets it only by redeeming that invite, which tower makes once the domain is set. T-0110 now carries all the script changes. T-0108 keeps only the portcullis config.

Your assumption 4 holds: setting the domain makes tower replace acme's whole portcullis entry. I asked about it on TH-0047. I keep closing I-0007 in T-0111.
