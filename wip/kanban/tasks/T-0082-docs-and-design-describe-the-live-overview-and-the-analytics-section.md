---
id: T-0082
type: task
nature: feature
title: Docs and design describe the live Overview and the Analytics section
status: backlog
parent: S-0012
owner: bytepunx
created: 2026-11-06T18:10:44Z
updated: 2026-11-06T18:10:44Z
transitions: []
stream: S-0012
tags: [web]
touches: [web/TESTING.md, design/system/overview.md, design/stories/web/002-overview.md, docs/users/index.md]
after: [T-0074, T-0078]
---
# T-0082 Docs and design describe the live Overview and the Analytics section

## Work

- In `web/TESTING.md`, remove the note that the Overview is deferred and that no chronicle or keep client stubs exist. Name the new fakes and specs in the tiers they belong to.
- In `design/system/overview.md`, under "State on 2026-10-21", replace the line saying no dashboard or chart exists in web. Say what the Overview and Analytics show now.
- In `design/stories/web/002-overview.md`:
  - tick the criteria the story met;
  - record that Recent Activity reads tower's feed alone until keep and herald serve their activity routes;
  - bump `updated`.
- In `docs/users/index.md`, say what the Overview's three tiles and the Analytics section show a tenant admin, which permission each needs, and what "unavailable" means.

Waits for T-0074 and T-0078: it describes what they built.

## Done when

- [ ] The four documents say what the Overview and Analytics do after this story, and nothing they say contradicts the code.
- [ ] Each edited design and docs file has its `updated` date bumped.
- [ ] The markdown lint passes through `flai test` on the four paths, or `scripts/lint-md.sh`.

## Notes

The chronicle URL setting goes in `docs/operators/index.md` with T-0059, not here.
