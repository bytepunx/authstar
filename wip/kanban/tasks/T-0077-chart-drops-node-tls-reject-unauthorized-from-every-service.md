---
id: T-0077
type: task
nature: remediation
title: Chart drops NODE_TLS_REJECT_UNAUTHORIZED from every service
status: done
parent: S-0015
owner: bytepunx
created: 2026-11-06T18:10:25Z
updated: 2026-11-14T10:40:37Z
transitions:
  - to: ready
    at: 2026-11-14T10:39:23Z
    by: agent-S-0015
  - to: in-progress
    at: 2026-11-14T10:39:23Z
    by: agent-S-0015
  - to: done
    at: 2026-11-14T10:40:37Z
    by: agent-S-0015
stream: S-0015
tags: [chart, spiffe, mtls]
touches: [chart/values.yaml, chart/README.md, design/stories/chart/001-chart-layout-and-provisioning-hook.md, docs/operators/chronicle-configuration.md, docs/operators/index.md]
after: [T-0056, T-0069, T-0072, T-0075, T-0171]
usage:
  source: log
  seconds: 74
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 11
      output: 2456
      cache_read: 1546991
      cache_write: 11692
      cost: 0.4478
---
# T-0077 Chart drops NODE_TLS_REJECT_UNAUTHORIZED from every service

## Work

Once herald, keep, steward, and web each trust the SPIRE bundle for tower, the chart no longer needs to turn TLS verification off.

- Remove the `NODE_TLS_REJECT_UNAUTHORIZED` entry, and the comment that explains it, from the `extraEnv` of herald, keep, steward, and web in `chart/values.yaml`.
- Rewrite the `extraEnv` paragraph of the file's header, which names the workaround.
- Rewrite the `<service>.extraEnv` row of `chart/README.md`, and the workaround in `design/stories/chart/001-chart-layout-and-provisioning-hook.md`, to say that the services verify tower against the SPIRE bundle, linking the ADR of T-0054.
- Render the chart with `helm template` and confirm no manifest sets the variable.

It waits for the four service tasks, T-0056, T-0069, T-0072, and T-0075: removing the variable before a service trusts the bundle would break that service's calls to tower.

## Done when

- No file under `chart/` sets `NODE_TLS_REJECT_UNAUTHORIZED`, and `helm template` of the chart renders none.
- `chart/README.md` and the chart design story describe the trust-bundle agent instead of the workaround.
- `flai check --strict` passes.

## Notes
