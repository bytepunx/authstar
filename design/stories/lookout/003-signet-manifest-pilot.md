# Story 003 — Signet Manifest Pilot

**Epic:** Deployment
**Repo:** lookout (manifest + Dockerfile), authstar-chart (aggregation + CI)
**Status:** Draft
**Per:** [ADR 0105](../../decisions/0105-signet-manifest-and-aggregated-onboarding-spec.md)

---

## Summary

Lookout is the pilot for ADR 0105's signet manifest mechanism: it has exactly one field
(`rabbitmqUrl`, a secret, non-derivable — per `src/lib/signet-config.ts`), making it the smallest
possible end-to-end proof of manifest → image embed → chart-side aggregation → CI check before
rolling the same pattern to the remaining seven services.

---

## Acceptance Criteria

### lookout

- [ ] `signet-manifest.yaml` at repo root:
  ```yaml
  service: lookout
  fields:
    - name: rabbitmqUrl
      kind: secret
      required: true
      derivable: false
      description: >
        AMQP connection URL (with credentials) for the RabbitMQ broker lookout publishes
        ingestion events to. Cannot be derived -- must reference a real broker.
  ```
- [ ] A compile step (`npm run build:manifest` or folded into the existing `build` script) turns
      this into `signet-manifest.json` (a straight YAML→JSON conversion, no schema validation
      library needed for one field — add one if/when the schema grows enough to warrant it).
- [ ] `Dockerfile`'s final stage `COPY`s the compiled `signet-manifest.json` to
      `/signet-manifest.json` in the image.
- [ ] Fix the Dockerfile's and `server.ts`'s stale "no signet-client wiring exists yet for
      lookout" comments while touching this file — lookout has had signet wiring since Story 002;
      the comments predate it and were never updated.

### authstar-chart

- [ ] A script (`tools/aggregate-manifest.ts` or similar, TS to match `hook/`) that: for each
      service in `values.yaml`, attempts `crane export <image.repository>:<image.tag> -` piped
      to extract `/signet-manifest.json`; on success, adds that service's `signetNamespace`/
      `signetService`/`fields` to the aggregated output; on failure (no such file in the image —
      expected for the 7 services not yet onboarded), logs a warning and skips it, does not fail
      the run.
- [ ] Running the script produces `manifest.json` at the chart root, containing lookout's entry
      (once its image with the embedded manifest is published) and nothing else yet.
- [ ] A CI workflow (`.github/workflows/manifest.yml` or added to existing CI) re-runs the
      aggregation script and fails if `git diff --exit-code manifest.json` is non-clean —
      confirms the committed file matches what the script produces against the `image.tag`s
      `values.yaml` currently references.
- [ ] README gets a short section explaining `manifest.json`'s purpose and how to regenerate it
      locally (`crane` install instructions, the one command to run).

## Not Covered Here

- The remaining 7 services' manifests — separate follow-up stories once this pilot's pipeline is
  verified working end-to-end.
- The `signet onboard` wizard CLI itself — tracked in the `signet` project per ADR 0105, not
  authstar.
- Auto-committing the regenerated `manifest.json` via a bot, or relaxing CI enforcement to
  release-tags-only — deferred per ADR 0105's Consequences until regeneration overhead is
  actually felt.
