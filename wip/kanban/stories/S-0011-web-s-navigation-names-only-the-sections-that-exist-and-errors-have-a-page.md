---
id: S-0011
type: story
nature: remediation
title: Web's navigation names only the sections that exist and errors have a page
status: ready
parent: E-0004
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-10-21T05:13:56Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
tags: []
---
# S-0011 Web's navigation names only the sections that exist and errors have a page

## Goal

A tenant admin never clicks into a 404: web's nav lists only built sections, unbuilt ones are hidden behind a flag until their story lands, every route has an error page, and form submissions show a pending state.

## Acceptance criteria
- [ ] `web/src/lib/permissions.ts` sections without a route are not rendered in the nav
- [ ] `+error.svelte` exists at the root of web and steward with a plain message and a way back
- [ ] Web's forms use `use:enhance` with a pending state, and `load` failures from tower or keep show an error rather than SvelteKit's default 500
- [ ] Component and behavior tests cover the nav and error page

## Tasks

## Notes

ADR-0049 fixes the eight-section information architecture; hiding is a presentation rule, not a change to it.
