---
id: TH-0021
title: "T-0038 is blocked: the harness cannot serve a tenant's JWKS in-cluster. Split criterion 3's harness half?"
anchor:
  path: wip/kanban/stories/S-0009-chronicle-verifies-the-es256-internal-jwt-portcullis-mints.md
  item: S-0009
status: resolved
participants: [agent-S-0009, bytepunx]
created: 2026-11-06T18:10:14Z
updated: 2026-11-06T18:37:00Z
---

# TH-0021 T-0038 is blocked: the harness cannot serve a tenant's JWKS in-cluster. Split criterion 3's harness half?

On wip/kanban/stories/S-0009-chronicle-verifies-the-es256-internal-jwt-portcullis-mints.md.

## Entries

### 2026-11-06T18:10:14Z agent-S-0009
The golden path's chronicle step cannot pass with a genuine portcullis token through config alone. Recorded as I-0007.

## What works

Portcullis already forwards its ES256 internal JWT, with the `tenant` header, to any application upstream (`portcullis/crates/authstar-proxy/src/proxy/mod.rs`). An `acme` application pointing at chronicle in `integration/config/authstar/portcullis.yaml` would deliver a real token.

## What blocks it

- Chronicle fetches `https://authstar.<domain>/.well-known/jwks.json`; the scheme is fixed in `@bytepunx/authstar-fastify`. Portcullis listens plain HTTP on 3710, and nothing in `integration/` terminates TLS.
- No in-cluster DNS maps `authstar.<domain>` to a Service (README "Not yet done").
- Step 1 creates `acme` without a domain, so tower answers none.

Fixing it needs a TLS front with a self-signed cert, a CoreDNS rewrite in kube-system, CA trust in chronicle, and script and portcullis config changes. That is about a story of harness work, and it can only be proven on a live cluster. This session cannot run one: the host's kube context is a remote Linode cluster, which I will not touch.

## Consequence now

Chronicle refuses HS256 after this story, so step 6's self-minted HS256 token will fail in the harness until that work lands.

## Recommended

A. Split criterion 3's harness half into a new story under E-0003: "Golden path reads chronicle's report with a portcullis-forwarded ES256 token", covering the TLS front, DNS, the `acme` domain, and step 6. S-0009's criterion 3 keeps only "behavior and e2e tests mint ES256 test tokens". I cancel T-0038 and add a small task here so step 6 says plainly that it is skipped until that story lands, and the README's chronicle row and HS256 passages state the new gap. You reword the criterion and create the story, or tell me to.

## Other answers

- B. Widen S-0009 to do the harness work itself. It stays untested here.
- C. Change nothing. S-0009 goes to review with criterion 3 unticked, and step 6 left failing.

Until you answer, I finish T-0034 and T-0036. Their tests wait on TH-0012.

### 2026-11-06T18:19:02Z bytepunx
A

### 2026-11-06T18:37:00Z agent-S-0009
Resolved: Operator chose A: criterion 3's harness half moved to draft S-0017; S-0009's criterion 3 reworded; T-0038 cancelled; T-0086 makes step 6 skip the token read with the reason.
