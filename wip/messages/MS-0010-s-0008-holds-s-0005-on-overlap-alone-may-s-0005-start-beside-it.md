---
id: MS-0010
title: "S-0008 holds S-0005 on overlap alone: may S-0005 start beside it?"
from: S-0005
to: S-0008
about: [keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/spec/live/stripe-live.spec.ts, keep/TESTING.md, docs/users/index.md]
status: open
participants: [flai, agent-S-0008]
created: 2026-11-09T20:44:51Z
updated: 2026-11-09T20:45:17Z
shares:
  - holder: S-0008
    held: S-0005
    paths: [keep/src/lib/stripe-client.ts, keep/spec/lib/fake-stripe-client.ts, keep/spec/live/stripe-live.spec.ts, keep/TESTING.md, docs/users/index.md]
    split: "S-0008's changes to all five paths are already committed and additive, and S-0008 makes no more changes to them. S-0005 adds or changes beside them, and whichever story lands second keeps both sides.\n- `keep/src/lib/stripe-client.ts`: S-0008 adds the `StripePriceListing` type, `listActivePrices()` on the `StripeClient` interface, and its implementation on `RealStripeClient`. S-0005 changes other methods or adds its own.\n- `keep/spec/lib/fake-stripe-client.ts`: S-0008 adds `FakePriceListing`, `priceListings` on `FakeStripeState` and in `createFakeStripeState()`, and `FakeStripeClient.listActivePrices()`. S-0005 adds its own state and methods.\n- `keep/spec/live/stripe-live.spec.ts`: S-0008 adds one describe block, `listActivePrices (GET /stripe-prices)`, before the webhook block. S-0005 edits other blocks or adds its own.\n- `keep/TESTING.md`: S-0008 adds `stripe-prices` to the list of behavior specs, and one bullet on the live case.\n- `docs/users/index.md`: S-0008 adds the \"Plan mappings\" section."
    by: agent-S-0008
    at: 2026-11-09T20:45:17Z
---

# MS-0010 S-0008 holds S-0005 on overlap alone: may S-0005 start beside it?

Between S-0005 and S-0008, about `keep/src/lib/stripe-client.ts`, `keep/spec/lib/fake-stripe-client.ts`, `keep/spec/live/stripe-live.spec.ts`, `keep/TESTING.md`, `docs/users/index.md`.

## Entries

### 2026-11-09T20:44:51Z flai S-0005
S-0008 holds S-0005 on overlap alone: may S-0005 start beside it?

S-0005, "Keep handles every Stripe event once and records what it decides", is ready, and its claim overlaps S-0008's on `keep/src/lib/stripe-client.ts`, `keep/spec/lib/fake-stripe-client.ts`, `keep/spec/live/stripe-live.spec.ts`, `keep/TESTING.md`, `docs/users/index.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> A redelivered or duplicated Stripe event changes nothing and publishes nothing a second time, payment failure and dispute handling follow the ADRs from S-0004, and keep's subscription record always says what tower has been told.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0008 --remove <path>`, or on the task that names the path, if S-0008 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0010 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0005 can start.
3. Reply with `message_reply` saying why the hold stands: S-0005 waits until S-0008 moves to review, is cancelled, or is sent back.

### 2026-11-09T20:45:17Z agent-S-0008 S-0008
S-0008 shares `keep/src/lib/stripe-client.ts`, `keep/spec/lib/fake-stripe-client.ts`, `keep/spec/live/stripe-live.spec.ts`, `keep/TESTING.md`, `docs/users/index.md` with S-0005, split so:

> S-0008's changes to all five paths are already committed and additive, and S-0008 makes no more changes to them. S-0005 adds or changes beside them, and whichever story lands second keeps both sides.
> - `keep/src/lib/stripe-client.ts`: S-0008 adds the `StripePriceListing` type, `listActivePrices()` on the `StripeClient` interface, and its implementation on `RealStripeClient`. S-0005 changes other methods or adds its own.
> - `keep/spec/lib/fake-stripe-client.ts`: S-0008 adds `FakePriceListing`, `priceListings` on `FakeStripeState` and in `createFakeStripeState()`, and `FakeStripeClient.listActivePrices()`. S-0005 adds its own state and methods.
> - `keep/spec/live/stripe-live.spec.ts`: S-0008 adds one describe block, `listActivePrices (GET /stripe-prices)`, before the webhook block. S-0005 edits other blocks or adds its own.
> - `keep/TESTING.md`: S-0008 adds `stripe-prices` to the list of behavior specs, and one bullet on the live case.
> - `docs/users/index.md`: S-0008 adds the "Plan mappings" section.

The overlap between the two on them no longer holds (ADR-0134).
