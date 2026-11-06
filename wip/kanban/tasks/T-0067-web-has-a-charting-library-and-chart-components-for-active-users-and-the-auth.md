---
id: T-0067
type: task
nature: feature
title: Web has a charting library and chart components for active users and the auth funnel
status: backlog
parent: S-0012
owner: bytepunx
created: 2026-11-06T18:10:03Z
updated: 2026-11-06T18:10:03Z
transitions: []
stream: S-0012
tags: [web]
touches: [web/package.json, web/package-lock.json, design/tech/tech-stack.md, web/src/lib/components/ActiveUsersChart.svelte, web/src/lib/components/AuthFunnelChart.svelte, web/spec/components/active-users-chart.spec.ts, web/spec/components/auth-funnel-chart.spec.ts]
---
# T-0067 Web has a charting library and chart components for active users and the auth funnel

## Work

- Choose a charting library for Svelte 5 that renders server-side or as plain SVG and needs no canvas in the component tests' DOM.
  - Add it to `web/package.json` and `web/package-lock.json` with `npm install` in `web`.
  - Record the choice, its version, and why under "web, steward (SvelteKit)" in `design/tech/tech-stack.md`, as the story's notes ask.
- Add `web/src/lib/components/ActiveUsersChart.svelte`.
  - It takes a series of `{ period, count }` points and a `compact` flag.
  - Full size is the Analytics page's DAU/WAU/MAU chart.
  - Compact is the Overview tile's headline number and sparkline: one component, two renderings, as ADR-0059 and ADR-0061 ask.
- Add `web/src/lib/components/AuthFunnelChart.svelte`.
  - It takes attempts, successes, and failures by provider, and the failure breakdown by reason.
  - Show the redemption figure as a count, never as a rate (`design/stories/web/007-analytics.md`).
- Both components take plain props, not chronicle's types, so this task waits for no other.

## Done when

- [ ] `web/spec/components/active-users-chart.spec.ts` renders the full and the compact chart from a series, and an empty series without error.
- [ ] `web/spec/components/auth-funnel-chart.spec.ts` renders every provider's bars and the failure breakdown.
- [ ] `design/tech/tech-stack.md` names the library, its version, and the reason.
- [ ] The tests pass through `flai test` once web's tiers are wired (I-0003), or else with `npm run test:components` in `web`. `npm run check` in `web` is clean.

## Notes

The library is the story agent's choice, recorded in the design/tech entry. Prefer one that adds no runtime dependency to the widget bundle (`vite.widgets.config.ts`).
