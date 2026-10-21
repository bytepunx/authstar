# ADR 0105: Per-Service Signet Manifests, Aggregated by authstar-chart

- **Status:** Accepted
- **Date:** 2026-09-04
- **Affects:** chronicle, herald, keep, lookout, portcullis, steward, tower, web (each gains a
  manifest + Dockerfile change); authstar-chart (gains the aggregation tool + CI check)
- **Depends on:** [ADR 0104](0104-helm-chart-and-provisioning-hook.md) (the chart and hook this
  feeds into), [ADR 0102](0102-signet-precedence-and-fallback-scope.md) (Signet-Configured Mode,
  which is what a populated bundle activates)

## Context

`authstar-chart`'s provisioning hook (ADR 0104) pushes `values.<service>.config`/`.secrets`
into signet, but nothing tells an operator *what* to put in those maps. That knowledge is
scattered across each service's own `config.ts`/`env.ts`/`signet-config.ts` and its ADR/story —
there's no machine-readable declaration a tool could read to walk a new user through providing
exactly what's needed, distinguishing values that must come from a human (a real Stripe key, a
RabbitMQ broker URL) from values a tool could generate itself (a random JWT signing key). This
gap is general to any signet-consuming system, not authstar-specific, but authstar is where it's
first being solved, and authstar-chart is the first consumer.

## Decision

### Each service ships a `signet-manifest.json`, embedded in its image

A service declares its own requirements in `signet-manifest.json` at its repo root:

```json
{
  "service": "lookout",
  "fields": [
    {
      "name": "rabbitmqUrl",
      "kind": "secret",
      "required": true,
      "derivable": false,
      "description": "AMQP connection URL (with credentials) for the RabbitMQ broker lookout publishes ingestion events to. Cannot be derived -- must reference a real broker."
    }
  ]
}
```

This is a schema (field names, kind, required/derivable, human-readable description), never
actual values. Authored directly as JSON, no YAML/compile step — the field list is flat and
small enough that a parser dependency and build step per repo isn't worth it; revisit if the
schema grows enough to need comments or cross-references a compile step could help with. It's
`COPY`'d as-is into the final image stage (e.g. `/signet-manifest.json`) — so a tool can read a
service's requirements straight from its published image without needing the
source repo, and the declaration is guaranteed to match the exact code shipped in that image
(not whatever's on `main` at tool-run time).

### `authstar-chart` aggregates every service's manifest into one file at CI time

`authstar-chart` already knows the full topology (`values.yaml`'s `image.tag` and
`signet.namespace`/service name per service), so it's the right place to own aggregation. A
script extracts `/signet-manifest.json` from each of the 8 images at exactly the tag `values.yaml`
references (via `crane export <image>:<tag> - | tar -xO signet-manifest.json` — no local Docker
daemon required, works directly against the registry), and merges them into one committed
`manifest.json` at the chart root:

```yaml
services:
  lookout:
    signetNamespace: authstar-platform
    signetService: lookout
    fields: [...]
  chronicle:
    ...
```

A service without a manifest yet is skipped with a warning, not a hard failure — this lets
services adopt the manifest incrementally rather than requiring an atomic all-8-at-once rollout.

### CI regenerates and diffs `manifest.json`; a mismatch fails the build

The committed `manifest.json` is not hand-maintained — the same aggregation script re-runs in
`authstar-chart`'s CI, and the build fails if the regenerated output differs from what's
committed. This is the same discipline as checking in generated code/lockfiles: bumping any
service's `image.tag` in `values.yaml` forces a manifest refresh before merge, catching drift
between what a service's Deployment activates and what's actually documented as required —
exactly the class of gap manually caught and fixed during ADR 0104's own implementation (four
services silently missing their signet bootstrap wiring).

### The onboarding wizard itself is explicitly out of scope for this ADR

A `signet onboard <manifest.json>` (or similar) CLI command that walks a user through every
required, non-derivable field, auto-fills derivable ones, and either pushes directly to signet
(`PutServiceConfig`/`SyncBundle`, keyed by each field's `kind` and the manifest's
`signetNamespace`/`signetService`) or exports SOPS-encrypted files in signet's git-sync layout —
is real, valuable follow-on work, but belongs in the `signet` CLI itself (general to any
signet-consuming system, not authstar-specific) and is a separate, larger effort. This ADR's
scope ends at producing `manifest.json` as a trustworthy, committed, CI-verified artifact; even
without a wizard, it's already a large improvement over "read 8 codebases to find out what
signet needs" for a human doing this by hand.

### Derivable-field generation is client-side for now

Whatever eventually reads a `derivable` field's generator id runs the generation itself (random
hex, EC keypair, etc.) rather than asking signet's server to generate and store a secret without
ever exposing the plaintext to the caller. A server-side `GenerateSecret` RPC would be more
"signet-native" and avoids the plaintext ever transiting a CLI process, but is new signet-server
scope, deferred as a future enhancement rather than blocking this ADR.

## Consequences

- **All 8 service repos**: gain `signet-manifest.json` and a Dockerfile change embedding it into
  the final image stage. Rolled out incrementally,
  starting with a pilot (lookout — simplest service, one field, no config-only fields) to prove
  the full pipeline (manifest → image embed → chart-side extraction → CI check) before repeating
  across the remaining 7. A story is written per service as it's onboarded, not one giant story.
- **authstar-chart**: gains the aggregation script and a CI workflow that regenerates and diffs
  `manifest.json`. `manifest.json` starts out covering only whichever services have adopted the
  manifest so far (warn-not-fail for the rest), converging on all 8 as each is onboarded.
- **Release-step overhead**: bumping a service's `image.tag` now requires a manifest-regen pass
  before merge if that service's manifest changed. If this becomes a real chore as adoption
  scales, options to revisit (not decided now): only enforce regeneration on tagged releases
  rather than every commit, or have CI auto-commit the regenerated file via a bot rather than
  failing and requiring a manual local re-run.
- **The onboarding wizard** (`signet onboard` or equivalent) is tracked as explicit follow-on
  work in the `signet` project, not this ADR's implementation.

## Related

- [ADR 0104](0104-helm-chart-and-provisioning-hook.md) — the chart and provisioning hook
  `manifest.json` is meant to make easier to populate correctly
- [ADR 0102](0102-signet-precedence-and-fallback-scope.md) — Signet-Configured Mode, activated
  once a service's bundle is actually populated using this manifest
