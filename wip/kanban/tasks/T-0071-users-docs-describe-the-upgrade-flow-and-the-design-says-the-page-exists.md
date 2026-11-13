---
id: T-0071
type: task
nature: feature
title: Users' docs describe the upgrade flow, and the design says the page exists
status: done
parent: S-0007
owner: bytepunx
created: 2026-11-06T18:10:08Z
updated: 2026-11-09T21:39:34Z
transitions:
  - to: ready
    at: 2026-11-09T21:31:58Z
    by: agent-S-0007
  - to: in-progress
    at: 2026-11-09T21:31:58Z
    by: agent-S-0007
  - to: done
    at: 2026-11-09T21:39:34Z
    by: agent-S-0007
stream: S-0007
tags: [web]
touches: [docs/users/index.md, design/system/overview.md, design/stories/web/010-hosted-pages.md, design/stories/web/005-billing.md, design/stories/keep/002-stripe-webhook-handling.md]
after: [T-0051, T-0061]
usage:
  source: log
  seconds: 456
  estimated: true
  priced_by: harness
  models:
    - model: claude-opus-5-5
      input: 31
      output: 8231
      cache_read: 3540958
      cache_write: 95419
      cost: 1.4726
---
# T-0071 Users' docs describe the upgrade flow, and the design says the page exists

## Work

`docs/users/index.md` is a stub. Add a section on upgrading:

- where the `<authstar-upgrade-button>` leads
- what the plan list shows
- that payment happens on Stripe's own page
- what the success and cancelled pages say
- that the roles arrive once Stripe confirms the payment

Correct the design where it says the page does not exist or is deferred:

- `design/system/overview.md` § State on 2026-10-21
- `design/stories/web/010-hosted-pages.md`, the upgrade section
- `design/stories/web/005-billing.md`, its deferrals
- `design/stories/keep/002-stripe-webhook-handling.md`, which says checkout creation is not wired

Link the ADR that T-0051 writes. Do not edit ADR-0065, which is accepted.

It waits for T-0051, whose ADR says who may list plans, and T-0061, whose page the docs describe.

## Done when

- `docs/users/index.md` describes the upgrade flow.
- No design document listed above says the upgrade page is missing or deferred.
- The markdown lint and `flai check --strict` pass.

## Notes

Planned by planner-S-0007. S-0008 changes `docs/users/index.md` and `design/system/overview.md` too. A trial merge judges the overlap.
