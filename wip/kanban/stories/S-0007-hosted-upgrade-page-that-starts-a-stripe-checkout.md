---
id: S-0007
type: story
nature: feature
title: Hosted upgrade page that starts a Stripe checkout
status: backlog
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-11-06T21:11:49Z
transitions: []
tags: [web, keep, portcullis]
topics: [billing]
touches: [keep/src/routes/plan-mappings.ts, keep/spec/behavior/plan-mappings.spec.ts, design/adrs/README.md, portcullis/crates/authstar-middleware/src/upgrade.rs, portcullis/crates/authstar-middleware/src/lib.rs, portcullis/crates/authstar-proxy/src/main.rs, portcullis/crates/authstar-middleware/tests/integration_tests.rs, portcullis/TESTING.md, web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(hosted)/_authstar/upgrade/+page.server.ts, web/src/routes/(hosted)/_authstar/upgrade/+page.svelte, web/src/routes/(hosted)/_authstar/upgrade/success/+page.svelte, web/src/routes/(hosted)/_authstar/upgrade/cancelled/+page.svelte, web/spec/behavior/hosted-upgrade.spec.ts, web/e2e/hosted-upgrade.spec.ts, web/TESTING.md, integration/scripts/scenario-golden-path.sh, integration/scripts/provision.sh, integration/README.md, docs/users/index.md, design/system/overview.md, design/stories/web/010-hosted-pages.md, design/stories/web/005-billing.md, design/stories/keep/002-stripe-webhook-handling.md]
usage:
  source: sum
  seconds: 0
  models: []
  strategic:
    - kind: orchestrator
      seconds: 44
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 23
          output: 151
          cache_read: 745714
          cache_write: 113070
          cost: 0.9626
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 0
    by: alex
    at: 2026-11-06T18:21:07Z
forecast:
  duration: 8h
  delivery: 2026-11-07T05:12:00Z
  basis: "Its own forecast of 8h; 2nd in the pull order with an in-progress limit of 4, behind S-0006, S-0008 and S-0011."
  by: flai
  at: 2026-11-06T21:11:49Z
---
# S-0007 Hosted upgrade page that starts a Stripe checkout

## Goal

A user who clicks `<authstar-upgrade-button>` lands on the hosted `/_authstar/upgrade` page, picks a plan from the tenant's plan mappings, and is sent to a Stripe Checkout session keep creates; after payment the webhook grants the mapped roles and the user returns to the application. This is the first caller of keep's checkout-sessions route.

## Acceptance criteria
- [ ] Web serves `/_authstar/upgrade` under `(hosted)` per ADR-0065, listing the tenant's active plan mappings with their price details
- [ ] Choosing a plan calls keep's checkout-sessions route with the caller's scope and redirects to Stripe
- [ ] Success and cancel return URLs land back on the application with a clear state
- [ ] The integration harness's golden path exercises the page against Stripe test mode and the resulting `checkout.session.completed` webhook
- [ ] `docs/users/` describes the upgrade flow

## Tasks
- T-0051 Keep lets an account of the tenant list its active plan mappings
- T-0055 Portcullis proxies /_authstar/upgrade and its pages to web behind the auth gate
- T-0057 Web's keep client creates a checkout session, and the fake does too
- T-0061 Web serves /_authstar/upgrade, sends the chosen plan to Stripe, and confirms the return
- T-0066 Golden path opens the upgrade page, starts a test-mode checkout, and delivers checkout.session.completed
- T-0071 Users' docs describe the upgrade flow, and the design says the page exists

## Notes

Depends on nothing but is more useful after S-0008 gives the page price details. `web/src/widgets/upgrade-button.ts` already links to the page. `keep/src/routes/checkout-sessions.ts` exists with no caller.

### Planning

Touches. The story declared none, and `flai touches suggest S-0007` had nothing to start from. Every touch is predicted from the criteria, ADR-0065, and the code layout, and each one is a file, not a folder.

| Touch | Source | Why |
|-------|--------|-----|
| `keep/src/routes/plan-mappings.ts`, `keep/spec/behavior/plan-mappings.spec.ts` | layout | The list route requires `billing:manage`, so a plain account cannot see the plans (T-0051). |
| `design/adrs/README.md` | design | T-0051 records who may list active mappings in a new ADR. Its file name is unknown until `flai adr new` writes it. |
| `portcullis/crates/authstar-middleware/src/upgrade.rs`, `.../src/lib.rs`, `portcullis/crates/authstar-proxy/src/main.rs`, `portcullis/crates/authstar-middleware/tests/integration_tests.rs`, `portcullis/TESTING.md` | layout, design | No portcullis code reads `webUpstream`, so the page cannot be reached (ADR-0065, ADR-0066). T-0055 follows S-0006's T-0014 pattern. |
| `web/src/lib/server/clients/keep.ts`, `web/spec/fixtures/fake-keep-client.ts` | layout | The client and fake have no checkout method (T-0057). |
| `web/src/routes/(hosted)/_authstar/upgrade/` pages and specs, `web/TESTING.md` | design, layout | ADR-0065's three pages. `(hosted)` adds no URL segment. `web/TESTING.md` lists the page as missing (T-0061). |
| `integration/scripts/scenario-golden-path.sh`, `integration/scripts/provision.sh`, `integration/README.md` | layout | Criterion 4's golden path, plus a plan mapping to buy (T-0066). |
| `docs/users/index.md` | design | Criterion 5. |
| `design/system/overview.md`, `design/stories/web/010-hosted-pages.md`, `design/stories/web/005-billing.md`, `design/stories/keep/002-stripe-webhook-handling.md` | design | Each says the page is missing or deferred (T-0071). |

`keep/src/routes/checkout-sessions.ts` is left out. It is registered in `keep/src/lib/build-app.ts` and needs no change.

Tags and topic. The story delivers to web, keep, and portcullis, each with an additive change. The topic is `billing`.

After. None. The page reads `unitAmount`, `currency`, and `interval` from the plan mappings keep already returns, not from S-0008's stripe-prices route. S-0006 and S-0008 change some of the same files (portcullis's `main.rs` and `lib.rs`, web's keep client and fake, `docs/users/index.md`, `design/system/overview.md`). A trial merge judges those overlaps, so they set no order.

Forecast. 8h, up from `flai forecast`'s 1h. That 1h is `planning.default_duration`, with one done story to learn from and no touches counted. The plan has six tasks in three layers across four components, including an ADR, a Rust route, and a golden-path step against Stripe test mode. S-0008 has five tasks over two components and was given 5h. Delivery is 8h from planning time, because the story is not yet started.

Cost of delay. Not yet set. The story and E-0002 have no inputs, so `flai cod S-0007` refuses. TH-0014 asks the operator for them.
