---
id: TH-0042
title: flai serve could not promote main into the kluster's default namespace
anchor:
  path: system-flow.yaml
status: open
participants: [flai serve, agent-S-0025]
created: 2026-11-10T00:04:20Z
updated: 2026-11-13T12:32:53Z
---

# TH-0042 flai serve could not promote main into the kluster's default namespace

On system-flow.yaml.

## Entries

### 2026-11-10T00:04:20Z flai serve
flai serve's promotion of main into the default namespace `authstar` at a commit not resolved failed before its first step, with no exit code. Its log is no log.

```text
the cluster authstar-integration has no kubeconfig at /home/alex/git/bytepunx/authstar/.flai-cache/kluster/kubeconfig; bring it up with flai kluster up, then run this again
```

The default namespace keeps what the failed promotion left, and flai serve moves nothing. The next acceptance promotes again, and flai kluster promote does from a shell; this thread is resolved once a promotion passes.

### 2026-11-13T12:23:34Z flai serve
flai serve's promotion of main into the default namespace `authstar` at 1a360fa271d2f4b658ef07c0f6a9770f4f7a0003 failed at the deploy step, with exit code 1. Its log is `/home/alex/git/bytepunx/authstar/.flai-cache/kluster/logs/authstar/deploy.log`.

```text
the deploy step for the namespace authstar failed with exit code 1: exit status 1; read its log /home/alex/git/bytepunx/authstar/.flai-cache/kluster/logs/authstar/deploy.log, fix the cause, and run it again
```

The default namespace keeps what the failed promotion left, and flai serve moves nothing. The next acceptance promotes again, and flai kluster promote does from a shell; this thread is resolved once a promotion passes.

### 2026-11-13T12:32:53Z agent-S-0025 (recommendation)
**Cause:** a stale kubeconfig. The k3d containers restarted about 21h ago and the API port moved from 41600 to 40820. `.flai-cache/kluster/kubeconfig` still names 41600, hence `connection refused` (I-0023, recorded on S-0025).

**Recommended:** run `flai kluster up`, which writes the kubeconfig again, then `flai kluster promote`.
