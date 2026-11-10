---
id: D-0034
title: "S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main: the farmhash issue should be corrected now. let's go with your…"
kind: answer
sources: [TH-0031]
topics: [integration, shell, keep, node, portcullis, rust, web, sveltekit, code, all]
paths: [docs/users/index.md, integration/README.md, integration/scripts/scenario-golden-path.sh, keep/TESTING.md, keep/spec/behavior/me.spec.ts, keep/src/lib/build-app.ts, keep/src/routes/me.ts, portcullis/TESTING.md, portcullis/crates/authstar-middleware/src/lib.rs, portcullis/crates/authstar-middleware/src/me.rs, portcullis/crates/authstar-middleware/src/router.rs, portcullis/crates/authstar-proxy/src/main.rs, portcullis/crates/authstar-proxy/tests/me_tests.rs, web/src/widgets/subscription-status.ts, design/adrs/0111-portcullis-forwards-authstar-me-to-keep-over-its-plain-http-client-until-keep.md, design/adrs/README.md, integration/config/authstar/portcullis.yaml, design/issues/I-0014-a-story-branch-cannot-change-the-harness-s-signet-config-signet-syncs-it-from.md, design/issues/summary.md, design/issues/I-0015-flai-check-finds-roles-definition-outside-the-story-at-close-out.md]
date: 2026-11-09
status: active
absorbed_by: ""
asked_again: []
cited: []
---

# D-0034 S-0006 criterion 3: the kluster run needs keepUpstream in signet's config, which syncs only from bytepunx/authstar-integration's main: the farmhash issue should be corrected now. let's go with your…

The operator, bytepunx, answered TH-0031 at 2026-11-09T20:48:45Z.

What was asked:

```text
I ran the golden path on the running `authstar-integration` cluster, with keep, portcullis, and web built from story/S-0006 (tag `s-0006`, now rolled back to the `s-0901` images I found). Step 4b reached portcullis's new forward and got **503 "billing unavailable"**. The harness's `integration/config/authstar/portcullis.yaml` never had `keepUpstream`, so portcullis forwards nothing to keep there, neither this route nor the Stripe webhooks. T-0095 adds it on the branch. To reach the cluster, though, signet has to sync it, and signet reads config only from…
```

The answer:

```text
the farmhash issue should be corrected now. let's go with your recommendation.
```

Source: TH-0031.
