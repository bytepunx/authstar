---
id: T-0066
type: task
nature: feature
title: Golden path opens the upgrade page, starts a test-mode checkout, and delivers checkout.session.completed
status: backlog
parent: S-0007
owner: bytepunx
created: 2026-11-06T18:10:00Z
updated: 2026-11-06T18:11:32Z
transitions: []
stream: S-0007
tags: [integration]
touches: [integration/scripts/scenario-golden-path.sh, integration/scripts/provision.sh, integration/README.md]
after: [T-0051, T-0055, T-0061]
---
# T-0066 Golden path opens the upgrade page, starts a test-mode checkout, and delivers checkout.session.completed

## Work

Add an upgrade step to `integration/scripts/scenario-golden-path.sh`, after the Dex login. Step 4 today posts a synthetic `customer.subscription.created` and never calls Stripe.

1. Provision one active plan mapping for the test tenant in `integration/scripts/provision.sh`, on a test-mode price.
2. As the signed-in user, `GET /_authstar/upgrade` through portcullis, and check that the mapping is listed with its price.
3. Post the choice, and check for a 303 to a `checkout.stripe.com` URL. This is a real test-mode session that keep creates.
4. Paying on Stripe's hosted page needs a browser. So deliver a `checkout.session.completed` for that session's id to `/_authstar/webhooks/stripe`, signed with the tenant's webhook secret, as step 4 does.
5. Check that tower then grants the user the mapping's roles.
6. `GET /_authstar/upgrade/success` and `/_authstar/upgrade/cancelled`, and check that both render.

When the keep secret `stripe-secret-key-acme` is not an `sk_test_` key, skip steps 3 to 5 with a message naming the secret. Never call live Stripe. Describe the step, the skip, and the key it needs in `integration/README.md`.

It waits for T-0051 (the account's listing), T-0055 (portcullis routes the page), and T-0061 (the page itself).

## Done when

- The scenario passes end to end against kluster with a test-mode key, and its output names each check.
- Without a test-mode key it skips steps 3 to 5 and says why.
- `integration/README.md` describes the step under the golden-path scenario.

## Notes

Planned by planner-S-0007. Whether the integration secrets hold a test-mode key is unchecked. If none exists, the operator supplies one, as `STRIPE_LIVE_TEST_SECRET_KEY` for S-0008.

Risk: web may not verify portcullis's token in the harness. Web checks portcullis's ES256 token against `internalJwtJwksUrl`, which is `https://admin.acme.authstar.app/.well-known/jwks.json` in `integration/config/authstar/web.yaml`. That file says the URL does not resolve in-cluster. It is the same gap as I-0007, which TH-0021 raises for S-0009's chronicle step. If the gap is still open when this task starts, steps 2, 3, and 6 fail at web's JWT check. Ask on the story's plan thread rather than work around it.
