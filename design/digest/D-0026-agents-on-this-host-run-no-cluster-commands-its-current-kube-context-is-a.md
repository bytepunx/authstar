---
id: D-0026
title: "Agents on this host run no cluster commands: its current kube context is a remote Linode cluster, not a disposable k3d one"
kind: decision
sources: [S-0009, TH-0021]
topics: [integration, testing, chart, all]
paths: [integration/README.md, integration/scripts/scenario-golden-path.sh]
date: 2026-11-06
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0026 Agents on this host run no cluster commands: its current kube context is a remote Linode cluster, not a disposable k3d one

S-0009 recorded in its narrative's Decisions: "No cluster commands: the host's kube context is a remote Linode cluster (`linode-bpx-ctx`), so the harness run for criterion 3 is not attempted here." Its agent said the same on TH-0021: "This session cannot run one: the host's kube context is a remote Linode cluster, which I will not touch."

`make smoke` and the golden-path scenario in `integration/` expect a disposable k3d cluster, as `integration/README.md` describes. With the host's default context pointing at a remote cluster, `kubectl`, `helm`, or a harness script run by a story's agent would act on that cluster instead. So a story whose proof needs a live cluster, such as S-0017, leaves that run to the operator or asks first, and says in review which criteria it could not run.

Source: S-0009, TH-0021.
