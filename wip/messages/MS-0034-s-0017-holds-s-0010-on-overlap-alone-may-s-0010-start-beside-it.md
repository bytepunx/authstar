---
id: MS-0034
title: "S-0017 holds S-0010 on overlap alone: may S-0010 start beside it?"
from: S-0010
to: S-0017
about: [integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md, design/issues/summary.md]
status: open
participants: [flai, agent-S-0017]
created: 2026-11-13T21:36:03Z
updated: 2026-11-13T21:41:37Z
shares:
  - holder: S-0017
    held: S-0010
    paths: [integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md, design/issues/summary.md]
    split: "- `integration/config/authstar/portcullis.yaml`: S-0017 adds two applications to tenant `acme`, `_admin` on `authstar.acme.authstar.app` and `chronicle` on `chronicle.acme.authstar.app`, and rewrites the comments under `web`'s hosts. S-0010 changes the top-level fields, such as a lookout upstream, and acme's other fields.\n- `integration/scripts/scenario-golden-path.sh`: S-0017 changes step 1 (the domain), step 2 (the login with the first-admin invite, keeping `session_jwt`), and step 6's report read after the ingest. S-0010 owns step 6's lookout ingest and any check of the events portcullis emits. Whichever lands second keeps both sides.\n- `integration/README.md`: S-0017 edits the golden-path JWKS bullet, the \"Not yet done\" chronicle bullet, and a new subsection on the TLS front. S-0010 edits any other section.\n- `design/issues/summary.md`: generated. Whichever lands second keeps both rows."
    by: agent-S-0017
    at: 2026-11-13T21:41:37Z
---

# MS-0034 S-0017 holds S-0010 on overlap alone: may S-0010 start beside it?

Between S-0010 and S-0017, about `integration/config/authstar/portcullis.yaml`, `integration/scripts/scenario-golden-path.sh`, `integration/README.md`, `design/issues/summary.md`.

## Entries

### 2026-11-13T21:36:03Z flai S-0010
S-0017 holds S-0010 on overlap alone: may S-0010 start beside it?

S-0010, "Portcullis emits authentication events to lookout", is ready, and its claim overlaps S-0017's on `integration/config/authstar/portcullis.yaml`, `integration/scripts/scenario-golden-path.sh`, `integration/README.md`, `design/issues/summary.md`. It has no agent until it starts, so flai asks for it (ADR-0134).

Its goal:

> Every login attempt, success, failure, and logout at portcullis is posted to lookout as an analytics event in the shape ADR-0058 defines, so chronicle's auth-funnel report has data.

Answer in one of three ways:

1. Narrow your touches with `flai touches S-0017 --remove <path>`, or on the task that names the path, if S-0017 will not change it: the hold clears when the claims no longer overlap.
2. Share the paths with `flai message share MS-0034 --paths <path> "<split>"`, or the MCP tool `message_share`, saying who changes what, if the two stories can change them apart: the overlap on them no longer holds, and S-0010 can start.
3. Reply with `message_reply` saying why the hold stands: S-0010 waits until S-0017 moves to review, is cancelled, or is sent back.

### 2026-11-13T21:41:37Z agent-S-0017 S-0017
S-0017 shares `integration/config/authstar/portcullis.yaml`, `integration/scripts/scenario-golden-path.sh`, `integration/README.md`, `design/issues/summary.md` with S-0010, split so:

> - `integration/config/authstar/portcullis.yaml`: S-0017 adds two applications to tenant `acme`, `_admin` on `authstar.acme.authstar.app` and `chronicle` on `chronicle.acme.authstar.app`, and rewrites the comments under `web`'s hosts. S-0010 changes the top-level fields, such as a lookout upstream, and acme's other fields.
> - `integration/scripts/scenario-golden-path.sh`: S-0017 changes step 1 (the domain), step 2 (the login with the first-admin invite, keeping `session_jwt`), and step 6's report read after the ingest. S-0010 owns step 6's lookout ingest and any check of the events portcullis emits. Whichever lands second keeps both sides.
> - `integration/README.md`: S-0017 edits the golden-path JWKS bullet, the "Not yet done" chronicle bullet, and a new subsection on the TLS front. S-0010 edits any other section.
> - `design/issues/summary.md`: generated. Whichever lands second keeps both rows.

The overlap between the two on them no longer holds (ADR-0134).
