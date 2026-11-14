---
id: S-0008
type: story
nature: feature
title: Plan-mapping editor picks from the tenant's live Stripe prices
status: ready
parent: E-0002
owner: alex
created: 2026-10-21T05:13:12Z
updated: 2026-11-13T21:36:02Z
transitions:
  - to: ready
    at: 2026-10-21T05:29:49Z
    by: claude
  - to: in-progress
    at: 2026-11-06T17:47:20Z
    by: agent-S-0008
  - to: ready
    at: 2026-11-13T19:46:48Z
    by: bytepunx
blocked:
  - from: 2026-11-06T17:54:45Z
    until: 2026-11-06T17:56:15Z
    reason: awaiting the operator on TH-0009
  - from: 2026-11-06T17:56:59Z
    until: 2026-11-06T18:03:46Z
    reason: awaiting the operator on TH-0009
  - from: 2026-11-06T18:05:04Z
    until: 2026-11-06T18:09:29Z
    reason: awaiting the operator on TH-0009
  - from: 2026-11-06T18:09:46Z
    until: 2026-11-06T18:09:57Z
    reason: awaiting the operator on TH-0009
  - from: 2026-11-06T18:10:06Z
    until: 2026-11-06T18:16:37Z
    reason: awaiting the operator on TH-0009
  - from: 2026-11-06T18:35:14Z
    until: 2026-11-09T06:59:51Z
    reason: awaiting the operator on TH-0027
  - from: 2026-11-09T07:04:14Z
    until: 2026-11-09T07:05:40Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T07:05:54Z
    until: 2026-11-09T07:16:19Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T07:16:31Z
    until: 2026-11-09T07:17:13Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T07:17:25Z
    until: 2026-11-09T07:41:01Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T07:42:54Z
    until: 2026-11-09T20:44:49Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T20:45:05Z
    until: 2026-11-09T20:45:06Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T20:45:20Z
    until: 2026-11-09T20:45:26Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T20:45:36Z
    until: 2026-11-09T21:01:04Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T21:01:17Z
    until: 2026-11-09T21:10:35Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T21:10:46Z
    until: 2026-11-09T21:21:05Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-09T21:21:23Z
    until: 2026-11-10T03:13:21Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-10T03:21:20Z
    until: 2026-11-10T03:26:41Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-10T03:27:17Z
    until: 2026-11-10T03:45:55Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-10T03:46:19Z
    until: 2026-11-10T04:25:16Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-10T04:25:56Z
    until: 2026-11-10T04:45:50Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-10T04:46:21Z
    until: 2026-11-10T05:24:13Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-10T05:24:53Z
    until: 2026-11-13T12:32:48Z
    reason: awaiting the operator on TH-0030
  - from: 2026-11-13T12:32:49Z
    until: 2026-11-13T19:46:48Z
    reason: awaiting the operator on TH-0030
tags: [web]
topics: [billing]
touches: [design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, design/adrs/README.md, design/system/overview.md, keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/src/routes/stripe-prices.ts, keep/src/lib/build-app.ts, keep/spec/behavior/stripe-prices.spec.ts, keep/TESTING.md, keep/spec/live/stripe-live.spec.ts, web/src/lib/server/clients/keep.ts, web/spec/fixtures/fake-keep-client.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, web/spec/behavior/billing-plan-mappings.spec.ts, docs/users/index.md, design/issues/I-0003-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/summary.md, design/issues/I-0005-keep-s-permission-check-does-not-compare-the-token-s-tenant-with-the-route-s.md, design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md, design/issues/I-0008-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md, design/issues/I-0009-no-test-tier-type-checks-web-or-steward-scripts-test-sh-runs-vitest-only-never.md, design/issues/I-0011-keep-s-live-portal-session-test-sends-a-pre-adr-0100-token-and-gets-403.md, design/issues/I-0013-npm-12-blocks-dependency-install-scripts-so-farmhash-is-never-built-and-herald.md, design/issues/I-0020-overlap-messages-fire-for-design-issues-summary-md-a-generated-file-flai.md]
usage:
  source: log
  seconds: 2711
  priced_by: harness
  turns:
    - day: 2026-11-06
      ceremony: 6
      hand_edits: 5
      work: 110
    - day: 2026-11-09
      test_runs: 1
      hand_edits: 1
      work: 48
    - day: 2026-11-10
      hand_edits: 1
      work: 36
  models:
    - model: claude-opus-5-5
      input: 580
      output: 130164
      cache_read: 80578244
      cache_write: 1705308
      cost: 32.121
  strategic:
    - kind: orchestrator
      seconds: 192
      estimated: true
      models:
        - model: claude-opus-5-5
          input: 117
          output: 874
          cache_read: 3036246
          cache_write: 460493
          cost: 4.2673
cost_of_delay:
  inputs:
    revenue_per_week: 0
    penalty_per_week: 0
    time_lost_per_cycle: 15m
    by: alex
    at: 2026-11-06T17:59:54Z
forecast:
  duration: 5h
  delivery: 2026-11-14T15:12:00Z
  basis: "Its own forecast of 5h; 3rd in the pull order with an in-progress limit of 4, behind S-0006, S-0013, S-0025, S-0012 and S-0007."
  by: flai
  at: 2026-11-13T21:36:02Z
---
# S-0008 Plan-mapping editor picks from the tenant's live Stripe prices

## Goal

Creating a plan mapping in web lists the tenant's active Stripe prices and products instead of asking for a pasted price ID, as ADR-0046 requires.

## Acceptance criteria
- [x] Keep exposes a read-only route listing the tenant's active prices with product name, amount, currency, and interval, from the tenant's own Stripe key
- [x] Web's plan-mapping form offers those prices and submits the chosen ID; pasting remains possible for a price the list does not show
- [x] Keep's fake Stripe covers the listing in behavior tests and the live tier covers it against test mode

## Tasks
- T-0016 Record keep's stripe-prices route in an ADR and the overview
- T-0017 Keep's Stripe client lists a tenant's active prices, and the fake does too
- T-0018 Keep serves GET /tenants/{tenantSlug}/stripe-prices from the tenant's own key
- T-0019 Live tier lists a real test-mode price through keep's stripe-prices route
- T-0020 Web's keep client fetches the tenant's Stripe prices for the new-mapping page
- T-0022 Plan-mapping form offers the listed prices and keeps a pasted ID as a fallback
- T-0026 Web's plan-mapping form offers the tenant's live Stripe prices
- T-0085 Renumber S-0008's closed duplicate issue from I-0003 to I-0008
- T-0133 Web reads a plan mapping's roles as keep's roles field (ADR-0108)

## Notes

`web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts` takes a pasted ID; keep's `stripe-client.ts` has no prices list call.

### Verification

- Criteria 1 and 2 are verified. After the operator merged S-0002 and S-0004 into main, `make install` ran in the worktree. `flai test` on keep's and web's changed paths then passed: `scripts/test.sh`, every npm project's `npm test` plus portcullis's `cargo test` and clippy, in 7m21s. Keep's `npm test` type-checks with `tsc` first. Web's does not (I-0009), so `npm run check` (svelte-check) ran once in `web/`: 0 errors, 0 warnings.
- Criterion 3 is verified. Its fake half runs in `make test` (`keep/spec/behavior/stripe-prices.spec.ts`). Its live half ran against Stripe test mode with the operator's key: `npm run test:live` in `keep/`, with the key exported, passed `listActivePrices (GET /stripe-prices)` in 505ms. The suite passed 11 of 12. The other failure is the pre-existing portal-session test, which S-0008 does not touch (I-0011). The key was set in the shell but not exported, so a plain `npm run test:live` skipped all 12 tests silently.

### Planning

Touches. Before planning, the story declared only the ADR its agent wrote, so the rest are predicted. All of them are files, and none is a folder.

| Touch | Source | Why |
|-------|--------|-----|
| `design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md` | declared | `flai adr new --commit` added it in T-0016 as 0107. The story's agent renumbered it to 0110 (ADR-0110), because S-0004's ADRs 0107 to 0109 sit on its branch. The touch moved with the file. |
| `design/adrs/README.md`, `design/system/overview.md` | declared, design | The route is a new contract between web and keep. It refines ADR-0041 and carries out ADR-0046 (`decisions.md`). |
| `keep/src/lib/stripe-client.ts` | declared in Notes | Named above. The client has no prices list call. |
| `keep/spec/lib/fake-stripe-client.ts` | layout | This is keep's fake Stripe, which criterion 3 names. |
| `keep/src/routes/stripe-prices.ts` | layout | New file. Keep has one file per route group (`keep/TESTING.md`). |
| `keep/src/lib/build-app.ts` | co-change, layout | Every route group is registered here. |
| `keep/spec/behavior/stripe-prices.spec.ts` | layout | New behavior spec for the route. |
| `keep/spec/live/stripe-live.spec.ts` | layout | Keep's live tier, which criterion 3 names. |
| `keep/TESTING.md` | layout | Lists the route groups and the live cases. |
| `web/src/lib/server/clients/keep.ts`, `web/spec/fixtures/fake-keep-client.ts` | layout | Web's keep client and its fake. |
| `web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts` | declared in Notes | Named above. |
| `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte` | layout | The form itself. |
| `web/spec/behavior/billing-plan-mappings.spec.ts` | co-change, layout | Web's existing behavior spec for this page. |
| `docs/users/index.md` | declared by T-0026 | The story's agent added it for the user-facing change. S-0003 claims it too, and the two agents agree the order. |
| `design/issues/I-0003-s-0002-was-accepted-and-archived-but-its-ci-and-test-tier-commits-never-reached.md`, `design/issues/I-0004-accepted-stories-code-does-not-reach-main-s-0002-and-s-0004-were-archived-but.md`, `design/issues/I-0005-keep-s-permission-check-does-not-compare-the-token-s-tenant-with-the-route-s.md`, `design/issues/summary.md` | declared | The story's agent added them to record the issues it met. |

`flai touches suggest` also listed `keep/src/server.ts`, `keep/spec/lib/test-app.ts`, `keep/package.json`, and other route files. They are left out on purpose. `test-app.ts` already exposes `stripeState`. `server.ts` already wires the real client factory. Nothing here adds a dependency, since the Stripe SDK already lists prices.

Tag and topic. `web` is the component the story delivers to: the editor is the increment. Keep's new route is an additive change, released as a patch. The topic is `billing`.

After. None. S-0008 reads nothing that another open story writes. S-0004 (done) decided the plan-mapping semantics, and this story does not change them.

Forecast. 5h, adjusted from `flai forecast`'s 1h. That figure is `planning.default_duration` with no done story to learn from, and it counts no touches. There are five tasks across two components, with an ADR and an opt-in live-tier case, so 5h is the planner's estimate. Delivery is 5h from when the story started at 17:47Z.

Cost of delay. Not yet set. The operator gave the inputs on TH-0003: revenue 0, penalty 0, and 15m lost per cycle. `flai cod S-0008` still refuses, because `planning.hour_rate` is unset and the 15m cannot be priced without it. TH-0003 asks the operator for the rate.

Tasks. T-0020 and T-0022 duplicated T-0026, which the story's agent wrote while planning ran. The story's agent cancelled them, as TH-0008 proposed. The plan is T-0016 and T-0017, then T-0018 and T-0026, then T-0019.
