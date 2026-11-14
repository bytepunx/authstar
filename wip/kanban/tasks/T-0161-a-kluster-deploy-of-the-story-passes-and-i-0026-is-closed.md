---
id: T-0161
type: task
nature: remediation
title: A kluster deploy of the story passes and I-0026 is closed
status: backlog
parent: S-0030
owner: bytepunx
created: 2026-11-14T10:10:03Z
updated: 2026-11-14T10:10:03Z
transitions: []
stream: S-0030
tags: [kluster, issues]
touches: [design/issues/I-0026-a-kluster-deploy-s-image-build-fails-when-docker-hub-s-token-endpoint-drops-the.md, design/issues/summary.md]
after: [T-0152, T-0154]
---
# T-0161 A kluster deploy of the story passes and I-0026 is closed

## Work

Commit what the earlier tasks wrote. Ask flai serve for a kluster deploy of S-0030 at its branch's head with `kluster_deploy`, or `flai kluster deploy S-0030 --job`. Hold `wait_for_events` until the deploy reports, and check that all eight `kluster-build.sh` builds passed. Note any retry the build logs show. A registry that drops no call during the run still shows the builds pass through the new loop.

Then close the issue:

```sh
flai issue close I-0026 --reason "scripts/kluster-build.sh runs docker build again, up to KLUSTER_BUILD_ATTEMPTS, when its output names a transient registry failure such as Docker Hub's token endpoint dropping the connection; scripts/test-kluster-build.sh reproduces the dropped call with a fake docker"
```

flai writes the issue file and regenerates `design/issues/summary.md`. Tick each criterion with `criteria_tick` once you have verified it.

This task waits for T-0152 and T-0154: the deploy runs the tested script, and the reason names the test and the documented variables.

## Done when

- The deploy at the branch's head passed every build step, and its job id is in this task's Notes.
- `flai issue show I-0026` reports it closed with the reason above.
- Both acceptance criteria of S-0030 are ticked.

## Notes
