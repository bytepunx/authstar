---
id: I-0002
title: Tower's SPIFFE SVID is fetched once at boot and expires after 4h
class: defect
status: closed
count: 1
first_reported: 2026-10-21T05:12:11Z
last_reported: 2026-10-21T05:12:11Z
updated: 2026-11-14T10:37:25Z
---

# I-0002 Tower's SPIFFE SVID is fetched once at boot and expires after 4h

## Description
Tower's SPIFFE SVID is fetched once at boot and expires after 4h

## Instances

### 2026-10-21T05:12:11Z
Story: S-0001.
tower/src/lib/spiffe-mtls.ts loads the X.509 SVID at startup as a static server certificate; SPIRE's TTL is 4h, so new mTLS connections from portcullis fail after that. Reported as bytepunx/authstar-tower#4 on 2026-08-24, still open.

## Remediation

Story S-0016 remediates this issue, created from it at 2026-11-06T17:38:17Z.
Closed 2026-11-14T10:37:25Z: S-0016 fixed it. Tower applies each SVID SPIRE pushes on the Workload API's FetchX509SVID stream with `setSecureContext`, through `watchSVIDRotation` in `tower/src/lib/spiffe-mtls.ts` (added in 5f77cad, made injectable and stoppable in 17d9621). New handshakes therefore see the current certificate past the boot SVID's 4h TTL, and the process exits only when the stream ends. `tower/spec/behavior/spiffe-svid-rotation.spec.ts` (c36df18) reproduces the cause and proves the fix over real TLS: tower starts on an expired SVID and a validating client fails with CERT_HAS_EXPIRED; after a push, new handshakes present the fresh SVID and POST /enrich clears the mTLS gate. `tower/TESTING.md` says so (2607108).
