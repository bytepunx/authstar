---
id: T-0185
type: task
nature: remediation
title: Pass the kluster golden-path check on a fresh namespace and a rerun, then close I-0035
status: done
parent: S-0039
owner: bytepunx
created: 2026-11-18T07:38:12Z
updated: 2026-11-18T08:38:59Z
transitions:
  - to: ready
    at: 2026-11-18T07:46:06Z
    by: agent-S-0039
  - to: in-progress
    at: 2026-11-18T07:46:06Z
    by: agent-S-0039
  - to: done
    at: 2026-11-18T08:38:59Z
    by: agent-S-0039
stream: S-0039
tags: [integration, kluster]
touches: [design/issues/I-0035-golden-path-s-login-races-tower-s-restart-after-tenant-provisioning-changes-its.md, design/issues/summary.md]
after: [T-0186]
usage:
  source: log
  seconds: 3173
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 165
      output: 36692
      cache_read: 18227396
      cache_write: 207680
      cost: 6.0414
---
# T-0185 Pass the kluster golden-path check on a fresh namespace and a rerun, then close I-0035

## Work

This task waits for T-0182, because it runs the scenario with both waits in place. It runs beside the README task, with which it shares no path.

The fresh namespace's first run is the test that reproduces I-0035. Provisioning answers 201 and sets off tower's restart, and tower's 27-second hang (I-0031) is still on main until S-0038 lands. So the run passes only if the scenario waits.

1. Deploy the story's namespace fresh, with `flai kluster deploy S-0039 --job` or the MCP tool `kluster_deploy`, and run the checks with `flai checks run S-0039 --job` or `kluster_checks`.
2. Run the checks again with no redeploy.
3. In both runs' logs, find the helper's lines for each restart it waited for: tower and portcullis after step 1 on the first run, herald and tower after step 5 on both.
4. When a run fails, fix the scenario or the helper, say why in the narrative's `## Decisions`, and start again at step 1.
5. Once both pass, run `flai issue close I-0035 --reason "<reason>"`. The reason says that the golden path now waits for each signet-coordinated restart it sets off, after provisioning and after herald's key rotation. It names the two passing runs, and names I-0030 on `story/S-0014` as the same defect. flai rewrites the issue and `design/issues/summary.md`; edit neither by hand.

## Done when

- The kluster golden-path check passes on the fresh namespace's first run and on the rerun with no redeploy, and their logs show the waits.
- I-0035 is closed with the reason above.
- `flai check --strict` passes.

## Notes
