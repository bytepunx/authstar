---
id: T-0027
type: task
nature: remediation
title: Nav and Overview list only the sections that have a route
status: backlog
parent: S-0011
owner: bytepunx
created: 2026-11-06T17:48:32Z
updated: 2026-11-06T17:51:51Z
transitions: []
stream: S-0011
tags: [web]
touches: [web/src/lib/permissions.ts, web/spec/behavior/permissions.spec.ts, web/spec/behavior/admin-layout.spec.ts, web/spec/components/nav.spec.ts, design/stories/web/001-app-shell-auth-and-section-gating.md]
---
# T-0027 Nav and Overview list only the sections that have a route

## Work

- Add a `built` flag to `AdminSection` in `web/src/lib/permissions.ts`. Set it to true for `overview`, `applications`, and `billing`, the sections with a route under `web/src/routes/(admin)/`. Set it to false for `identity`, `communications`, `analytics`, `privacy`, and `settings`. The story that builds a section sets its flag to true.
- Make `visibleSections` return only sections that are built and that the account may see. `ADMIN_SECTIONS` keeps all eight entries, since ADR-0049's section map does not change. The nav in `(admin)/+layout.svelte` and the tiles on the Overview page both read `data.sections`, so both drop unbuilt sections.
- Add a comment above the flag saying that hiding a section is a presentation rule, not a change to ADR-0049.
- Write the rule into `design/stories/web/001-app-shell-auth-and-section-gating.md` under Section Gating.
- Tests:
  - `web/spec/behavior/permissions.spec.ts`: an unbuilt section is hidden even from an account holding its permission.
  - A new `web/spec/behavior/admin-layout.spec.ts`: the `(admin)` layout load returns no unbuilt section.
  - `web/spec/components/nav.spec.ts`: the nav renders no link for an unbuilt section.

## Done when

- [ ] An account with every permission sees only Overview, Applications, and Billing in the nav and among the Overview tiles.
- [ ] The behavior and component tests above pass, through `flai test` once the test tiers are wired (I-0003), or else with `npm run test:behavior` and `npm run test:components` in `web`. They fail if the `built` filter is removed.
- [ ] `design/stories/web/001-app-shell-auth-and-section-gating.md` states the rule.

## Notes

The flag is a constant in code, not an environment variable. Web has no flag mechanism, and a section is built or not per release.
