---
id: I-0036
title: "flai verify panics with a nil pointer dereference at cmd/verify.go:314 when its close-out job is interrupted"
class: defect
status: open
count: 1
cost: 8m
first_reported: 2026-11-14T18:19:15Z
last_reported: 2026-11-14T18:19:15Z
updated: 2026-11-15T07:27:56Z
---

# I-0036 flai verify panics with a nil pointer dereference at cmd/verify.go:314 when its close-out job is interrupted

## Description
flai verify panics with a nil pointer dereference at cmd/verify.go:314 when its close-out job is interrupted

## Instances

### 2026-11-14T18:19:15Z
Story: S-0023.
S-0023's close-out job S-0023-20261114T181250Z, at 3719d6a, was cancelled 6m3s into the test tier, during portcullis's `me_tests.rs` ("stopped: context canceled"). `flai verify` then printed "verify: S-0023 stopped at test (interrupted)" and panicked: `runtime error: invalid memory address or nil pointer dereference` in `cmd.(*app).verifyStory` at `flai/cmd/verify.go:314`, called from `verify.go:218`. flai serve reported the verdict as interrupted, and the run was lost. The cancellation's cause is not in the job log.

## Remediation

Story S-0035 remediates this issue, created from it at 2026-11-15T07:27:56Z.
