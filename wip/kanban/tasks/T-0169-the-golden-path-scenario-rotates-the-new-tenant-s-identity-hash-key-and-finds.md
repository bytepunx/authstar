---
id: T-0169
type: task
nature: remediation
title: The golden-path scenario rotates the new tenant's identity-hash key and finds no prune failure in tower's log
status: backlog
parent: S-0029
owner: bytepunx
created: 2026-11-14T10:10:39Z
updated: 2026-11-14T10:10:39Z
transitions: []
stream: S-0029
tags: [tower, integration]
touches: [integration/scripts/scenario-golden-path.sh, integration/README.md]
after: [T-0166]
---
# T-0169 The golden-path scenario rotates the new tenant's identity-hash key and finds no prune failure in tower's log

## Work

This task waits for T-0166, because it checks on a real signet the rotate-keys behavior T-0166 builds. I-0025 was found live; the fake never refused GetServiceConfig until S-0017 taught it to.

In `integration/scripts/scenario-golden-path.sh`, after the scenario provisions its tenant, call `POST /operator/tenants/<slug>/rotate-keys` with `{ "keys": ["identity-hash"] }` and tower's operator token. Assert the answer is 200 with the key in `rotated`. Then assert tower's log since the call holds no `pruning past-retention key generations failed` and no `GetServiceConfig`. Rotate identity-hash only: it is the one generations array provisioning writes. Describe the step in `integration/README.md`.

Deploy the story to its kluster namespace and run its checks with `flai kluster deploy S-0029 --job` and `flai checks run S-0029 --job`, and record the outcome in this task's Notes.

## Done when

- The scenario's rotate step passes on the story's kluster namespace.
- `integration/README.md` describes the step.
- `flai test` passes on the changed paths.

## Notes
