---
id: I-0004
title: "Accepted stories' code does not reach main: S-0002 and S-0004 were archived but their branches were never merged"
class: defect
status: open
count: 1
cost: 10m
first_reported: 2026-11-06T17:53:19Z
last_reported: 2026-11-06T17:53:19Z
updated: 2026-11-06T17:53:19Z
---

# I-0004 Accepted stories' code does not reach main: S-0002 and S-0004 were archived but their branches were never merged

## Description
Accepted stories' code does not reach main: S-0002 and S-0004 were archived but their branches were never merged

## Instances

### 2026-11-06T17:53:19Z
Story: S-0003.
On 2026-11-06, main held only the acceptance commits for S-0002 (e34a1c3) and S-0004 (44f8497), which moved the work items. origin/story/S-0002, with the root Makefile targets and component test scripts, and origin/story/S-0004 were not merged. Because of this, S-0003's template upgrade replaced Makefile, scripts/README.md, and scripts/check.sh as unedited, and make test ran the template stub. S-0002's later merge will conflict on Makefile and scripts/README.md.

## Remediation
