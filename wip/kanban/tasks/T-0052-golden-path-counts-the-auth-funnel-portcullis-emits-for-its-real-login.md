---
id: T-0052
type: task
nature: feature
title: Golden path counts the auth funnel portcullis emits for its real login
status: backlog
parent: S-0010
owner: bytepunx
created: 2026-11-06T18:09:02Z
updated: 2026-11-06T18:09:02Z
transitions: []
stream: S-0010
tags: [integration, portcullis]
touches: [integration/config/authstar/portcullis.yaml, integration/scripts/scenario-golden-path.sh, integration/README.md]
after: [T-0048, T-0050]
---
# T-0052 Golden path counts the auth funnel portcullis emits for its real login

## Work

- In `integration/config/authstar/portcullis.yaml`, add `lookoutUpstream` beside `towerUpstream`, naming lookout's in-cluster service.
- In `integration/scripts/scenario-golden-path.sh`, remove step 6's synthetic `auth.login-succeeded` post to lookout: with it, the `logins > 0` check passes whether or not portcullis emits. Assert instead that the auth-funnel report counts the Dex login step 2 drives, with `signupConversion.logins` above zero. Read the report the way S-0009's T-0038 leaves the chronicle-report step, with a portcullis-forwarded ES256 token.
- Say in `integration/README.md` that the funnel counts come from portcullis.

Waits for T-0048, so lookout accepts what portcullis sends, and for T-0050, whose callback dispatches the events counted.

## Done when

- The golden path passes on a fresh cluster, and its funnel check fails when portcullis's `lookoutUpstream` is removed.
- `flai check --strict` and the markdown lint pass.

## Notes

The integration tier stays out of CI and runs locally with `make integration` (D-0008). If the cluster cannot be brought up in the agent's environment, leave criterion 3 unticked and say why in the story's notes. Portcullis has no `signet-manifest.json` and the chart provisions no portcullis bundle, so `integration/config/authstar/portcullis.yaml` is the only source of the key in this repository.
