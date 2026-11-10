---
id: T-0110
type: task
nature: remediation
title: Step 6 reads chronicle's auth-funnel report through portcullis with step 2's session cookie
status: backlog
parent: S-0017
owner: bytepunx
created: 2026-11-09T20:56:20Z
updated: 2026-11-09T20:56:20Z
transitions: []
stream: S-0017
tags: [integration]
touches: [integration/scripts/scenario-golden-path.sh]
after: [T-0108, T-0109]
---
# T-0110 Step 6 reads chronicle's auth-funnel report through portcullis with step 2's session cookie

## Work

Criterion 4.

- In step 2 of `integration/scripts/scenario-golden-path.sh` (lines 128-176), keep the `jwt` session cookie's value for later steps; today it only greps for `set-cookie: jwt=`.
- In step 6 (lines 291-320), keep the unauthenticated 401 check, and replace the skip at lines 316-319 with a request for chronicle's auth-funnel report through portcullis, on the `chronicle` application's host with step 2's cookie. Pass on a 200 with the report's shape, fail otherwise, and name the status and body on failure.

It waits for T-0108, which changes the same script and adds the `chronicle` host, and for T-0109, without which the read cannot pass.

## Done when

- `sh -n` and `shellcheck` pass on the script, and no step 6 skip names S-0017 or I-0007.
- On a running harness, run by the operator (D-0026, TH-0031), the golden path passes step 6 with the report read through portcullis. The run's output is written in the task's Notes; if no run can be made, the task says so and criterion 4 stays unticked.

## Notes
