---
id: T-0042
type: task
nature: remediation
title: Correct tower's TESTING.md on how the SVID rotates
status: backlog
parent: S-0016
owner: bytepunx
created: 2026-11-06T18:07:17Z
updated: 2026-11-06T18:07:17Z
transitions: []
stream: S-0016
tags: [tower, spiffe, docs]
touches: [tower/TESTING.md]
after: [T-0040]
---
# T-0042 Correct tower's TESTING.md on how the SVID rotates

## Work

`tower/TESTING.md`, in its entry for `src/lib/spiffe-mtls.ts`, says the SVID's rotation is "handled by process-restart-into-fresh-fetch". Since 5f77cad tower rotates in place instead, and T-0040 changes how the watch is called. Rewrite that entry to say:

- `watchSVIDRotation` applies each SVID SPIRE pushes with `setSecureContext`, so new handshakes see the current certificate.
- the process exits only when the stream ends, and Kubernetes restarts it into a fresh fetch.
- the watch takes an injected stream, and its stop function runs on shutdown.
- `spec/behavior/spiffe-svid-rotation.spec.ts` covers it.

It waits for T-0040, whose interface it describes. It shares no path with T-0041, so the two run together.

## Done when

- No line of `tower/TESTING.md` says the SVID rotates only by restarting the process.
- The entry names `watchSVIDRotation`, its stop function, and the rotation spec.
- The markdown lint passes on `tower/TESTING.md`.

## Notes
