---
id: I-0023
title: flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves
class: defect
status: open
count: 2
cost: 20m
first_reported: 2026-11-13T12:32:47Z
last_reported: 2026-11-13T19:47:34Z
updated: 2026-11-14T08:26:32Z
---

# I-0023 flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves

## Description
flai's kept kluster kubeconfig goes stale when the k3d containers restart and the API port moves

## Instances

### 2026-11-13T12:32:47Z
Story: S-0025.
S-0025: k3d's authstar-integration containers restarted about 21h before 2026-11-13T12:08Z and the API load balancer moved from 127.0.0.1:41600 to 127.0.0.1:40820. flai keeps .flai-cache/kluster/kubeconfig from `flai kluster up` and never writes it again, so every job after the restart fails: S-0005's teardown at 12:08:29Z (TH-0044, reported as a missing RabbitMQ pod until T-0136) and main's promote at 12:23:34Z (TH-0042, `dial tcp 127.0.0.1:41600: connect: connection refused`). `flai kluster status` still says running. The remedy now is `flai kluster up`, which writes the kubeconfig again; the lasting fix is in flai (write the kubeconfig with `kluster kubeconfig` before each job) or kluster (pin the API port).

### 2026-11-13T19:47:34Z
Story: S-0025.
Three more jobs failed on the stale kubeconfig (still 127.0.0.1:41600, while the load balancer listens on 40820): S-0025's teardown at 2026-11-13T12:59Z (TH-0046), main's promote at 13:01Z, and S-0025's deploy at 13:07Z. The deploy's new kluster_require check (T-0136) named the cause and the remedy; the image load step passed, since `k3d image import` needs no kubeconfig.

## Remediation

Story S-0027 remediates this issue, created from it at 2026-11-14T08:26:32Z.
