---
id: T-0091
type: task
nature: feature
title: scripts/kluster-teardown.sh removes a story namespace's vhost, user, and prefixed databases
status: backlog
parent: S-0019
owner: bytepunx
created: 2026-11-09T06:55:01Z
updated: 2026-11-09T06:55:01Z
transitions: []
stream: S-0019
tags: [kluster, scripts]
touches: [scripts/kluster-teardown.sh]
after: [T-0089]
---
# T-0091 scripts/kluster-teardown.sh removes a story namespace's vhost, user, and prefixed databases

## Work

Write `scripts/kluster-teardown.sh`, sourcing `scripts/lib-kluster.sh`, for the kluster block's `teardown`. It removes what the deploy made outside the namespace, as S-0575's `ns-down.sh` did; flai deletes the namespace itself afterwards.

- Refuse an empty `FLAI_KLUSTER_PREFIX` or the default namespace: a teardown never drops main's databases.
- `rabbitmqctl delete_vhost <namespace>` and `delete_user <namespace>`, each passing when already gone.
- `DROP DATABASE IF EXISTS` for `<prefix>tower`, `<prefix>keep`, and `<prefix>herald` in Postgres, and `<prefix>chronicle` in ClickHouse.
- Delete the namespace's signet policies by ID where the `signet` CLI lists them; leave its bundles, which the CLI cannot delete, and say so in its output.

Waits for T-0089, whose helpers and checks it uses.

## Done when

- `shellcheck` and `sh -n` pass.
- With `KLUSTER_DRY_RUN=1` for `s-0019` it prints the vhost, user, and four database removals naming `s-0019` and `s0019_`; for an empty prefix it exits non-zero having printed none.

## Notes

A teardown run twice is idempotent: everything it removes is removed only if present.
