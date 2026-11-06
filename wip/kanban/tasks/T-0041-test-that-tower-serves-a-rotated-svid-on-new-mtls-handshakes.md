---
id: T-0041
type: task
nature: remediation
title: Test that tower serves a rotated SVID on new mTLS handshakes
status: backlog
parent: S-0016
owner: bytepunx
created: 2026-11-06T18:07:11Z
updated: 2026-11-06T18:07:11Z
transitions: []
stream: S-0016
tags: [tower, spiffe, mtls, testing]
touches: [tower/spec/behavior/spiffe-svid-rotation.spec.ts, tower/spec/lib/spiffe-test-certs.ts]
after: [T-0040]
---
# T-0041 Test that tower serves a rotated SVID on new mTLS handshakes

## Work

Reproduce I-0002's cause in a behavior test, in a new file `tower/spec/behavior/spiffe-svid-rotation.spec.ts`. Use a real `https.Server` from `buildApp`'s `tls` option, as `tower/spec/behavior/spiffe-mtls.spec.ts` does, since `app.inject()` never performs a handshake.

- Let `generateLeafCert` in `tower/spec/lib/spiffe-test-certs.ts` take an optional validity window, so a test can mint a server SVID that has already expired. Existing callers keep the one-hour default.
- Start tower with SVID A, already expired. Show that a client validating tower's certificate against the trust bundle fails its handshake. This is the failure I-0002 reports.
- Push SVID B, valid, through the injected stream from T-0040. Show that a new handshake now presents B (by serial number) and that `POST /enrich` with a valid SPIFFE client certificate gets past the mTLS gate.
- End the injected stream and show that the stream-end handler is called.
- Stop the watch after each test so that vitest exits cleanly.

It waits for T-0040, which makes the watch's stream and stream-end handler injectable.

## Done when

- The new spec fails against a `watchSVIDRotation` that ignores pushes, and passes against T-0040's.
- `npm run test:behavior` passes in `tower/`, `tower/spec/behavior/spiffe-mtls.spec.ts` included.

## Notes
