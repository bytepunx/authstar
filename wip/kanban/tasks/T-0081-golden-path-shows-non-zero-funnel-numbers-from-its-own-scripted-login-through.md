---
id: T-0081
type: task
nature: feature
title: Golden path shows non-zero funnel numbers from its own scripted login, through web
status: backlog
parent: S-0012
owner: bytepunx
created: 2026-11-06T18:10:39Z
updated: 2026-11-06T18:10:39Z
transitions: []
stream: S-0012
tags: [integration]
touches: [integration/scripts/scenario-golden-path.sh, integration/README.md]
after: [T-0059, T-0078]
---
# T-0081 Golden path shows non-zero funnel numbers from its own scripted login, through web

## Work

- In step 6 of `integration/scripts/scenario-golden-path.sh`, drop the synthetic `POST ${LOOKOUT_URL}/events`.
  - Count the events the step-2 scripted login made portcullis emit to lookout, which S-0010 delivers.
  - Read the auth-funnel report with the portcullis-forwarded token that S-0009's T-0038 introduces.
  - Assert `signupConversion.logins` is above zero within the step's polling window.
- Add an assertion that web's `/analytics`, fetched through portcullis with the step-2 session, answers 200 and renders the funnel without "unavailable". This shows web reaches chronicle with the forwarded internal JWT in the live harness.
- Update `integration/README.md`: step 6 now reads a real login's events through web, and the synthetic-event gap is closed.

Waits for T-0059, which gives the harness's web its chronicle URL, and T-0078, which adds the `/analytics` page it fetches.

## Done when

- [ ] `./scripts/scenario-golden-path.sh`, after `up.sh`, `provision.sh`, and `deploy-local.sh`, passes step 6 with no synthetic lookout event, and logs the non-zero login count.
- [ ] The step fails, naming the stage, when no login reaches the report or when web's `/analytics` shows the funnel unavailable.
- [ ] `integration/README.md` describes the new step 6.

## Notes

The harness needs a kluster cluster. When the environment cannot run one, leave the first condition unticked and say why in the story's notes, as `work-management.md` asks.
