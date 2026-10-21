---
id: I-0002
title: Tower's SPIFFE SVID is fetched once at boot and expires after 4h
class: defect
status: open
count: 1
first_reported: 2026-10-21T05:12:11Z
last_reported: 2026-10-21T05:12:11Z
updated: 2026-10-21T05:12:11Z
---

# I-0002 Tower's SPIFFE SVID is fetched once at boot and expires after 4h

## Description
Tower's SPIFFE SVID is fetched once at boot and expires after 4h

## Instances

### 2026-10-21T05:12:11Z
Story: S-0001.
tower/src/lib/spiffe-mtls.ts loads the X.509 SVID at startup as a static server certificate; SPIRE's TTL is 4h, so new mTLS connections from portcullis fail after that. Reported as bytepunx/authstar-tower#4 on 2026-08-24, still open.

## Remediation
