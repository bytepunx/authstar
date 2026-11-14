---
id: T-0167
type: task
nature: remediation
title: A live teardown of s-0028 leaves its report readable after flai removes the log, and I-0024 is closed
status: backlog
parent: S-0028
owner: bytepunx
created: 2026-11-14T10:10:21Z
updated: 2026-11-14T10:10:21Z
transitions: []
stream: S-0028
tags: [kluster]
touches: [design/issues/I-0024-a-passing-kluster-teardown-deletes-its-own-log-so-what-it-removed-cannot-be.md, design/issues/summary.md]
after: [T-0162, T-0164]
---
# T-0167 A live teardown of s-0028 leaves its report readable after flai removes the log, and I-0024 is closed

## Work

- With T-0158 committed on the story branch, ask flai serve for S-0028's own deploy with `kluster_deploy`, then its teardown with `kluster_teardown`, and hold `wait_for_events` for each job's `kluster` event. Run no cluster command yourself (D-0026).
- Once the teardown passes and flai has removed `.flai-cache/kluster/logs/s-0028`, read the newest `s-0028-*` report under the main checkout's `.flai-cache/kluster/teardowns/`. Write in this task's Notes what it says each step removed.
- Close I-0024 with `flai issue close I-0024 --reason`, saying that the teardown now keeps its report where flai does not delete it, and naming the test.

It waits for T-0162 and T-0164, so the issue is closed only once the fix is tested and documented.

## Done when

- A passing live teardown of s-0028 left a report naming the namespace, each of the five steps with what it removed, and the outcome, read after flai removed the log.
- I-0024 is closed with a reason naming the fix and the test.

## Notes
