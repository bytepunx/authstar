---
id: TH-0042
title: flai serve could not promote main into the kluster's default namespace
anchor:
  path: system-flow.yaml
status: open
participants: [flai serve]
created: 2026-11-10T00:04:20Z
updated: 2026-11-10T00:04:20Z
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
