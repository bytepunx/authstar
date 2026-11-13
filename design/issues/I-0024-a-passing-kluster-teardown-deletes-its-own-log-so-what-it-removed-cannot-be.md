---
id: I-0024
title: A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards
class: efficiency
status: open
count: 1
cost: 15m
first_reported: 2026-11-13T21:52:05Z
last_reported: 2026-11-13T21:52:05Z
updated: 2026-11-13T21:52:05Z
---

# I-0024 A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards

## Description
A passing kluster teardown deletes its own log, so what it removed cannot be read afterwards

## Instances

### 2026-11-13T21:52:05Z
Story: S-0025.
S-0025: the teardown job S-0025-teardown-20261113T214604Z passed. flai then deleted .flai-cache/kluster/logs/s-0025 and the namespace's deployment record, so teardown.log was gone. A second `kluster_teardown` was refused, since there was no record. Proving that the signet bundles were deleted took a third deploy, which added 21 of 21 secrets, and a second teardown whose log had to be copied while it ran. The job record requests/S-0025.job.json keeps only the outcome, and its steps list the deploy's build steps rather than the teardown's.

## Remediation
