---
id: T-0151
type: task
nature: remediation
title: An ADR records that tower prunes portcullis's key generations from its own record and never reads portcullis's config
status: backlog
parent: S-0029
owner: bytepunx
created: 2026-11-14T10:09:45Z
updated: 2026-11-14T10:10:48Z
transitions: []
stream: S-0029
tags: [tower, signet, design]
touches: [design/adrs/0113-tower-prunes-portcullis-key-generations-from-its-own-record.md, design/adrs/README.md, design/stories/tower/011-tenant-management-and-key-rotation.md]
---
# T-0151 An ADR records that tower prunes portcullis's key generations from its own record and never reads portcullis's config

## Work

This task waits for no other task. It records the decision the code tasks build on, and shares no path with them, so it runs beside T-0157.

Signet's workload listener admits four GitOpsService RPCs: SyncBundle, PatchServiceConfig, PutServiceConfig, and GetSOPSPublicKey (`workloadGitOpsScopeAllowedMethods` in signet's `server/internal/server/server.go`). GetServiceConfig is not among them, so tower cannot read portcullis's config over the listener it dials (I-0025). ADR-0103 says signet authorizes GetServiceConfig by the caller's SPIFFE identity. That holds for the handler, not for the workload listener.

Write a new ADR, numbered after the highest ADR on main when the task starts (0113 is the prediction; rename the file and the touch if the number differs). It decides:

- Tower never reads portcullis's config document. It writes it only with PatchServiceConfig.
- Tower records each key generation it writes to portcullis's config (version and effectiveFrom, per tenant and per generations field) on the tenant actor.
- At rotation, tower prunes past-retention generations from that record. A generation is past retention when the generation after it took effect longer ago than the retention window, judged by `effectiveFrom`, never by `version`.
- Each removal carries an RFC 6902 `test` on the generation tower expects at that index. A document that differs fails the patch as a whole, which is logged, as today.
- A generation tower did not write, such as one from the harness's GitOps file or a tenant provisioned before this ADR, is never pruned by tower.

Name the option not taken: signet admitting GetServiceConfig on the workload listener, scoped by policy, a change to bytepunx/signet. Link ADR-0080, ADR-0088, and ADR-0103. Add the row to `design/adrs/README.md`.

In `design/stories/tower/011-tenant-management-and-key-rotation.md`, the rotate-keys section says no tenant actor state changes as a result of the route. Change it to say what the actor now records, linking the ADR.

## Done when

- The ADR exists with status accepted, and `design/adrs/README.md` lists it.
- Story 011's rotate-keys section matches the ADR.
- `flai check --strict` and the markdown lint pass on the changed files.

## Notes
