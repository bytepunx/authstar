---
id: MS-0060
title: "S-0022 holds S-0007 on overlap alone: may S-0007 start beside it?"
from: S-0007
to: S-0022
about: [web/TESTING.md, design/issues/summary.md, web/playwright.config.ts]
status: open
participants: [flai, agent-S-0022]
created: 2026-11-14T11:10:25Z
updated: 2026-11-14T11:11:54Z
shares:
  - holder: S-0022
    held: S-0007
    paths: [web/TESTING.md, design/issues/summary.md, web/playwright.config.ts]
    split: "S-0022's changes are apart from S-0007's.\n- `web/playwright.config.ts`: S-0022 replaces the fixed ports with ports picked per run, changes the preview command's `--port 4173` to the picked port, and sets `reuseExistingServer: false` on both webServer entries. S-0007's added `KEEP_BASE_URL` env line is untouched; it keeps reading `FAKE_BACKEND_URL`, which stays exported from `e2e/fixtures/urls.ts`.\n- `web/TESTING.md`: S-0022 changes only how the e2e tier is run (that `npm test` now runs it, and its ports). S-0007's entries for `hosted-upgrade.spec.ts`, Coverage, and Deferred stay as they are.\n- `design/issues/summary.md`: S-0022 changes it only through flai's regeneration when it closes I-0017. S-0007 may change it freely.\nWhichever story lands second keeps both sides."
    by: agent-S-0022
    at: 2026-11-14T11:11:54Z
---

# MS-0060 S-0022 holds S-0007 on overlap alone: may S-0007 start beside it?

Between S-0007 and S-0022, about `web/TESTING.md`, `design/issues/summary.md`, `web/playwright.config.ts`.

## Entries

### 2026-11-14T11:10:25Z flai S-0007
S-0022 holds S-0007 on overlap alone: may S-0007 start beside it?

S-0007, "Hosted upgrade page that starts a Stripe checkout", is ready, and its claim overlaps S-0022's on `web/TESTING.md`, `design/issues/summary.md`, `web/playwright.config.ts`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> A user who clicks `<authstar-upgrade-button>` lands on the hosted `/_authstar/upgrade` page, picks a plan from the tenant's plan mappings, and is sent to a Stripe Checkout session keep creates; after payment the webhook grants the mapped roles and the user returns to the application. This is the first caller of keep's checkout-sessions route.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0022 --remove <path>`, or on the task that names the path, if S-0022 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0060 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0007 can start.
3. Reply with `message_reply` saying why the hold stands: S-0007 waits until S-0022 moves to review, is cancelled, or is sent back.

### 2026-11-14T11:11:54Z agent-S-0022 S-0022
S-0022 shares `web/TESTING.md`, `design/issues/summary.md`, `web/playwright.config.ts` with S-0007, split so:

> S-0022's changes are apart from S-0007's.
> - `web/playwright.config.ts`: S-0022 replaces the fixed ports with ports picked per run, changes the preview command's `--port 4173` to the picked port, and sets `reuseExistingServer: false` on both webServer entries. S-0007's added `KEEP_BASE_URL` env line is untouched; it keeps reading `FAKE_BACKEND_URL`, which stays exported from `e2e/fixtures/urls.ts`.
> - `web/TESTING.md`: S-0022 changes only how the e2e tier is run (that `npm test` now runs it, and its ports). S-0007's entries for `hosted-upgrade.spec.ts`, Coverage, and Deferred stay as they are.
> - `design/issues/summary.md`: S-0022 changes it only through flai's regeneration when it closes I-0017. S-0007 may change it freely.
> Whichever story lands second keeps both sides.

The overlap between the two on them no longer holds (ADR-0134).
