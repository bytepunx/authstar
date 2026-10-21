---
id: E-0003
type: epic
nature: feature
title: Analytics pipeline carries real events
status: ready
owner: alex
created: 2026-10-21T05:12:30Z
updated: 2026-10-21T05:13:56Z
transitions:
  - to: ready
    at: 2026-10-21T05:13:56Z
    by: claude
tags: []
---
# E-0003 Analytics pipeline carries real events

## Outcome

An authentication event at portcullis reaches ClickHouse through lookout and RabbitMQ, and chronicle's reports answer a request authenticated with the ES256 internal JWT portcullis mints, so a dashboard built on chronicle can show a real number.

## Stories
- S-0009 Chronicle verifies the ES256 internal JWT portcullis mints
- S-0010 Portcullis emits authentication events to lookout

## Notes

From the 2026-10-20 audit: lookout to RabbitMQ to chronicle is wired and tested, and chronicle's auth-funnel, active-users, query, and export routes exist. Nothing feeds lookout (portcullis has no emitter; lookout accepts only `client.*` event types) and nothing can read chronicle (it verifies an HS256 shared secret while portcullis signs ES256; the integration harness flagged this as known and unaddressed).
- 2026-10-21T05:13:56Z: moved to ready: follows S-0009, which moved to ready
