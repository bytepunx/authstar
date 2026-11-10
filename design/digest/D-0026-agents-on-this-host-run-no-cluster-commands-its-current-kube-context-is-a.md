---
id: D-0026
title: "Agents on this host run no cluster commands: its current kube context is a remote Linode cluster, not a disposable k3d one"
kind: decision
sources: [S-0009, TH-0021, S-0019]
topics: [integration, testing, chart, kluster, all]
paths: [integration/README.md, integration/scripts/scenario-golden-path.sh, scripts/kluster-deploy.sh, scripts/kluster-teardown.sh]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: [S-0017, S-0019, S-0025, T-0087, T-0089, T-0092, T-0107, T-0109, T-0110, T-0128, T-0130, TH-0029, TH-0035, TH-0041]
---

# D-0026 Agents on this host run no cluster commands: its current kube context is a remote Linode cluster, not a disposable k3d one

S-0009 recorded in its narrative's Decisions: "No cluster commands: the host's kube context is a remote Linode cluster (`linode-bpx-ctx`), so the harness run for criterion 3 is not attempted here." Its agent said the same on TH-0021: "This session cannot run one: the host's kube context is a remote Linode cluster, which I will not touch."

`make smoke` and the golden-path scenario in `integration/` expect a disposable k3d cluster, as `integration/README.md` describes. The host's default context points at a remote cluster, so `kubectl`, `helm`, or a harness script run by a story's agent would act on that cluster instead. A story whose proof needs a live cluster, such as S-0017, leaves that run to the operator or asks first. In review, it says which criteria it could not run.

S-0019 kept the same rule for the kluster scripts, and it is enforced now: "`flai guard` refuses an agent `flai kluster deploy`". A live deploy and teardown are verified by the operator or by flai serve, never by the story's agent. That story and its task sub-agents checked each script with `shellcheck`, `sh -n`, and a `KLUSTER_DRY_RUN=1` run. The operator moved its live-deploy criterion to S-0025, which runs after S-0019, because it "can't be tested until change is reviewed and approved".

Source: S-0009, TH-0021, S-0019.
