---
id: T-0040
type: task
nature: remediation
title: Make tower's SVID rotation watch injectable and stoppable
status: backlog
parent: S-0016
owner: bytepunx
created: 2026-11-06T18:07:03Z
updated: 2026-11-06T18:07:03Z
transitions: []
stream: S-0016
tags: [tower, spiffe, mtls]
touches: [tower/src/lib/spiffe-mtls.ts, tower/src/server.ts]
---
# T-0040 Make tower's SVID rotation watch injectable and stoppable

## Work

Commit 5f77cad already rotates tower's server certificate: `watchSVIDRotation` in `tower/src/lib/spiffe-mtls.ts` reads the `FetchX509SVID` stream and calls `setSecureContext` on each push. No test can reach it, because it builds its own SPIFFE client and calls `process.exit` itself.

- Extract the SVID-to-PEM conversion that `fetchServerCredentials` and `watchSVIDRotation` both repeat into one function.
- Let `watchSVIDRotation` take its stream of X.509-SVID messages and its stream-end handler as optional arguments. The defaults stay the Workload API stream and `process.exit(1)`, so production behaves as it does today.
- Return a stop function that ends the watch. Call it from the shutdown path in `tower/src/server.ts`, so an open stream cannot keep the process alive after `app.close()`.

This task waits for no other: it is the first layer.

## Done when

- `watchSVIDRotation` accepts an injected message stream and stream-end handler, and returns a stop function.
- `tower/src/server.ts` still calls it after `app.listen()` resolves, and calls its stop function on shutdown.
- `npm run build` and `npm run test:behavior` pass in `tower/`.

## Notes
