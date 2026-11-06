---
id: T-0039
type: task
nature: improvement
title: docs/operators lists chronicle's configuration and the overview drops the shared-secret gap
status: backlog
parent: S-0009
owner: bytepunx
created: 2026-11-06T17:51:26Z
updated: 2026-11-06T17:51:26Z
transitions: []
stream: S-0009
tags: [chronicle, docs]
touches: [docs/operators/chronicle-configuration.md, docs/operators/index.md, design/system/overview.md]
after: [T-0037]
---
# T-0039 docs/operators lists chronicle's configuration and the overview drops the shared-secret gap

## Work

- Write `docs/operators/chronicle-configuration.md`. It lists every chronicle setting with its env variable, its signet bundle key, whether it is a secret, its default, and its chart value. Read the settings from `chronicle/src/lib/config.ts` and `signet-bundle-config.ts` after T-0034, and the chart values after T-0037. It also says that `analytics:read` routes verify the ES256 internal JWT per tenant against `https://authstar.<tenant domain>/.well-known/jwks.json`, with the domain resolved through tower, and that no shared secret exists any more.
- Link it from `docs/operators/index.md`. Give that page an index of settings by kind (argument, env, stored config, stored secret), as `design/conventions/documentation.md` asks, starting with chronicle.
- In `design/system/overview.md`, rewrite the line that says chronicle verifies a shared-secret token portcullis never mints so that it states how chronicle verifies now. Bump `updated`.

## Done when

- Every field of `ChronicleConfig` appears in `docs/operators/chronicle-configuration.md`, and the page is linked from `docs/operators/index.md`.
- `design/system/overview.md` no longer describes the HS256 gap.
- `flai check --strict` and the markdown lint pass.

## Notes

ADR-0036 and `design/stories/chronicle/` are historical records. Leave them as they are; ADR-0036 is accepted and immutable.
