---
id: I-0033
title: "herald, keep, and tower throw on a backward wall-clock step in production: node-flakes 2.1.0 refuses clock skew"
class: impression
status: open
count: 1
cost: 0m
first_reported: 2026-11-14T17:49:28Z
last_reported: 2026-11-14T17:49:28Z
updated: 2026-11-14T17:49:28Z
---

# I-0033 herald, keep, and tower throw on a backward wall-clock step in production: node-flakes 2.1.0 refuses clock skew

## Description
herald, keep, and tower throw on a backward wall-clock step in production: node-flakes 2.1.0 refuses clock skew

## Instances

### 2026-11-14T17:49:28Z
Story: S-0023.
Found by S-0023, which fixed only the test suites (I-0018). `node-flakes` 2.1.0 throws `NTP clock skew detected` in its `now < lastTime` branch whenever `Date.now()` reads earlier than the last id its generator made. consequent 2.0.1 builds one generator per `initialize()` and calls it in `createId` and on every dispatch (`enrichEvent`), with no way to inject a clock or an id generator. herald (`src/lib/flakes.ts`) and keep (`src/lib/ids.ts`) also call node-flakes directly. So every command these services handle fails while the host clock sits behind a reading it has already used, for as long as the step lasts. No production occurrence has been seen; the exposure comes from reading the code. The planner of S-0023 proposed a story to make node-flakes hold its last time instead of throwing, then to update its version in each service (TH-0040, question 1).

## Remediation
