---
id: T-0164
type: task
nature: improvement
title: scripts/README.md and integration/README.md say where a teardown's report is kept and how to read it
status: backlog
parent: S-0028
owner: bytepunx
created: 2026-11-14T10:10:14Z
updated: 2026-11-14T10:10:14Z
transitions: []
stream: S-0028
tags: [kluster, docs]
touches: [scripts/README.md, integration/README.md]
after: [T-0158]
---
# T-0164 scripts/README.md and integration/README.md say where a teardown's report is kept and how to read it

## Work

- In `scripts/README.md`, extend the `kluster-teardown.sh` row: it keeps a report of what each step found and removed in `.flai-cache/kluster/teardowns/` in the main checkout, which flai does not delete, and `KLUSTER_TEARDOWN_REPORTS` moves it. Add a row for `kluster-teardown.test.sh`.
- In `integration/README.md`, extend the Teardown row and the paragraph after the commands: flai deletes the teardown's own log, under `.flai-cache/kluster/logs`, once a teardown passes, so read the kept report instead, and name the command that lists the newest one.

It waits for T-0158, whose report it describes, and shares no path with T-0162, so the two run together.

## Done when

- Both READMEs name the report's folder, what it holds, and `KLUSTER_TEARDOWN_REPORTS`, and match what T-0158 built.
- The markdown lint passes on both files.

## Notes
