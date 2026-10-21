---
id: S-0010
type: story
nature: feature
title: Portcullis emits authentication events to lookout
status: backlog
parent: E-0003
owner: alex
created: 2026-10-21T05:13:43Z
updated: 2026-10-21T05:13:43Z
transitions: []
tags: []
---
# S-0010 Portcullis emits authentication events to lookout

## Goal

Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

## Acceptance criteria
- [ ] Portcullis has a lookout client configured from signet, posting events asynchronously so a slow or down lookout never delays a request
- [ ] Lookout accepts the server-side `auth.*` event types alongside `client.*`, validated against ADR-0058
- [ ] Chronicle's auth-funnel report returns non-zero counts for a login driven through the integration harness
- [ ] Rust and Node tests cover the emitter and the new event types; `design/system/overview.md` loses the dotted edge

## Tasks

## Notes

`portcullis/crates/authstar-middleware/src` has no lookout client; `lookout/src/lib/event-types.ts` lists `client.*` only; `chronicle/src/routes/auth-funnel.ts` expects the funnel events.
