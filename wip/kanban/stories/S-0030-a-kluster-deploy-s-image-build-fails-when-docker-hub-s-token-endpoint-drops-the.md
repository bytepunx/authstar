---
id: S-0030
type: story
nature: remediation
title: A kluster deploy's image build fails when Docker Hub's token endpoint drops the connection pulling a base image
status: backlog
owner: bytepunx
created: 2026-11-14T09:30:31Z
updated: 2026-11-15T07:10:14Z
transitions: []
tags: []
touches: [scripts/kluster-build.sh, scripts/test-kluster-build.sh, scripts/test.sh, scripts/README.md, integration/README.md, design/issues/I-0026-a-kluster-deploy-s-image-build-fails-when-docker-hub-s-token-endpoint-drops-the.md, design/issues/summary.md]
agent:
  harness: claude-code
  model: claude-opus-5-5
  config:
    effort: high
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: planner
      seconds: 211
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 372
          output: 17985
          cache_read: 16699101
          cache_write: 735633
          cost: 7.0086
    - kind: orchestrator
      seconds: 33
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 9
          output: 73
          cache_read: 352889
          cache_write: 41153
          cost: 0.4528
cost_of_delay:
  inputs:
    time_lost_per_cycle: 15m
    by: flai
    at: 2026-11-14T09:30:31Z
  value: 37.5
  by: planner-S-0030
  at: 2026-11-14T10:09:19Z
forecast:
  duration: 1h30m
  delivery: 2026-11-30T20:14:00Z
  basis: "Its own forecast of 1h30m; 10th in the pull order with an in-progress limit of 4, behind S-0014, S-0021, S-0022, S-0012, S-0007, S-0008, S-0010, S-0024, S-0026, S-0027, S-0028 and S-0029."
  by: flai
  at: 2026-11-15T07:10:14Z
finalized:
  by: bytepunx
  at: 2026-11-14T10:15:38Z
---
# S-0030 A kluster deploy's image build fails when Docker Hub's token endpoint drops the connection pulling a base image

## Goal

This story remediates [I-0026](../../../design/issues/I-0026-a-kluster-deploy-s-image-build-fails-when-docker-hub-s-token-endpoint-drops-the.md), "A kluster deploy's image build fails when Docker Hub's token endpoint drops the connection pulling a base image". The issue recommends no solution yet: propose one from its instances before building it.

## Acceptance criteria
- [ ] The cause I-0026 describes no longer occurs, with a test that reproduces it where one fits
- [ ] I-0026 is closed with `flai issue close I-0026 --reason` saying what fixed it

## Tasks
- T-0150 kluster-build.sh retries docker build on a transient registry failure
- T-0152 A test with a fake docker reproduces the dropped token call and runs in the test tier
- T-0154 The scripts and integration READMEs describe the build retry and its variables
- T-0161 A kluster deploy of the story passes and I-0026 is closed

## Notes

Cost of delay inputs set by flai from I-0026. time_lost_per_cycle 15m: 15m per occurrence × 1 occurrence ÷ 1 cycle of 168h (first reported 2026-11-14T09:13:58Z, 0 days before this story; under one cycle counts as one).

### Planning

Proposed fix, from I-0026's one instance: `scripts/kluster-build.sh` runs `docker build` again, up to a bounded number of attempts with a short delay between them, when the build's output names a transient registry failure. Examples are `failed to fetch oauth token`, `unexpected EOF`, `connection reset by peer`, `TLS handshake timeout`, `i/o timeout`, and a registry's 429 or 5xx. Any other failure, such as a compile error, fails at once, as today. The instance failed while loading `node:22-slim`'s metadata, before any step ran, so a retry costs seconds. Every service's Dockerfile pulls `node:22-slim`, or `rust:1-slim-bookworm` and `gcr.io/distroless/cc-debian12` for portcullis, so all eight builds share the risk. A base image the kluster keeps locally, the issue's other suggestion, was set aside: it needs a mirror or a pre-loaded image store on the host, which is a host change and the operator's, and it would still not cover a layer pull that drops.

Touches:

| Path | Source | Why |
|------|--------|-----|
| `scripts/kluster-build.sh` | design (I-0026), co-change | The script whose `docker build` failed; `flai touches suggest` from it lists nothing else (1 of 569 commits) |
| `scripts/test-kluster-build.sh` | layout | New POSIX `sh` test that puts a fake `docker` on `PATH` and reproduces the dropped token call |
| `scripts/test.sh` | layout | The project's one test tier (the manifest declares no `tests`), which runs the new test |
| `scripts/README.md` | layout | Its table describes each script; the retry and the new test change it |
| `integration/README.md` | layout | Its kluster table describes the build step |
| `design/issues/I-0026-a-kluster-deploy-s-image-build-fails-when-docker-hub-s-token-endpoint-drops-the.md` | criteria | `flai issue close I-0026` writes it |
| `design/issues/summary.md` | criteria | flai regenerates it when I-0026 closes |

No folder touch: every file is named.

No `after`: the story reads no other open story's output.

Figures:

- Forecast: flai gave 12m (79 s per unit over 5 done remediation stories, size 9). Raised to 1h30m: the close-out runs the `integration` and `smoke` tiers on every story, and showing criterion 1 live takes a kluster deploy of eight image builds under a 30m timeout. Delivery stays flai's, 2026-11-16T22:10:00Z, which the pull order sets (14th, in-progress limit 4).
- Cost of delay value: 37.50 USD a week, as `flai cod` works it out from the input flai set: 15m lost per 168h cycle at 150 USD an hour. It stands. The instance also sent S-0017 back from review (TH-0052), which costs more than 15m, but the input is the operator's to raise.
