---
id: I-0038
title: "Golden path step 4b: keep answers 403 on /_authstar/me/subscription through portcullis, intermittently, on a namespace's first checks run"
class: defect
status: open
count: 1
cost: 5m
first_reported: 2026-11-15T06:23:18Z
last_reported: 2026-11-15T06:23:18Z
updated: 2026-11-15T06:23:18Z
---

# I-0038 Golden path step 4b: keep answers 403 on /_authstar/me/subscription through portcullis, intermittently, on a namespace's first checks run

## Description
Golden path step 4b: keep answers 403 on /_authstar/me/subscription through portcullis, intermittently, on a namespace's first checks run

## Instances

### 2026-11-15T06:23:18Z
Story: S-0018.
flai serve's first checks run on namespace s-0018 at 3babcf4 (/home/alex/.flai/serve/checks/S-0018-20261115T062143Z.log) failed at golden-path step 4b with `FAIL: me/subscription through portcullis (HTTP 403): {"error":"forbidden"}`. Steps 1-4 had passed, including login with a real session cookie. Keep's log shows `GET /me/subscription` completing with 403 and no line saying why. When I looked, the pods were about 77s old, tower had restarted 18s earlier, and herald was 0/1. A second checks run at the same commit (S-0018-20261115T062254Z) passed every step, 4b included. S-0018 changes only test scripts, the manifest's test tiers, and steward's Playwright config, none of which is built into keep, portcullis, or tower. This looks like a startup race in the internal-JWT path (portcullis → keep) on a fresh deploy. Keep's 403 logs no reason, which makes it hard to tell which check refused.

## Remediation
