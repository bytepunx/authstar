---
id: I-0003
title: "GitHub Actions refuses every job: bytepunx organization billing or spending limit"
class: blocker
status: open
count: 1
first_reported: 2026-10-21T05:25:22Z
last_reported: 2026-10-21T05:25:22Z
updated: 2026-10-21T05:25:22Z
---

# I-0003 GitHub Actions refuses every job: bytepunx organization billing or spending limit

## Description
GitHub Actions refuses every job: bytepunx organization billing or spending limit

## Instances

### 2026-10-21T05:25:22Z
Story: S-0002.
Every workflow on bytepunx/authstar#1 was refused with 'The job was not started because recent account payments have failed or your spending limit needs to be increased'. No CI can run in this repository until the organization's billing is fixed; S-0002's CI was verified locally with make test only.

## Remediation
