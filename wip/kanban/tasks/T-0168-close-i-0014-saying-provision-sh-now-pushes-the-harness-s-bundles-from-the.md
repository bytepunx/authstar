---
id: T-0168
type: task
nature: remediation
title: Close I-0014 saying provision.sh now pushes the harness's bundles from the checkout
status: backlog
parent: S-0031
owner: bytepunx
created: 2026-11-14T10:10:23Z
updated: 2026-11-14T10:10:23Z
transitions: []
stream: S-0031
tags: [integration]
touches: [design/issues/I-0014-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md, design/issues/summary.md]
after: [T-0160, T-0165]
---
# T-0168 Close I-0014 saying provision.sh now pushes the harness's bundles from the checkout

## Work

Close I-0014 once the fix is tested and documented. This task waits for T-0160, whose passing test is the evidence for criterion 1, and for T-0165, whose documents the reason points to.

- Run `node --test scripts/harness-config.test.mjs` and `flai test` on the paths the story changed, and confirm both pass.
- Tick criterion 1 with `criteria_tick`.
- Run `flai issue close I-0014 --reason "<reason>"`. The reason says that `integration/scripts/provision.sh` no longer registers `bytepunx/authstar-integration` with signet, that it pushes each bundle from the checkout through `SyncBundle` with `scripts/kluster-signet-push.mjs`, as story namespaces already did (D-0036), and that `scripts/harness-config.test.mjs` guards both. Say that archiving the old repository is left to the operator (D-0006).
- Tick criterion 2.

## Done when

- `flai issue show I-0014` reports it closed with that reason.
- `design/issues/summary.md` no longer lists I-0014 as open.
- Both of the story's criteria are ticked.

## Notes
