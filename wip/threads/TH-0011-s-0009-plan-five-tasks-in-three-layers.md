---
id: TH-0011
title: "S-0009 plan: five tasks in three layers"
anchor:
  path: wip/kanban/stories/S-0009-chronicle-verifies-the-es256-internal-jwt-portcullis-mints.md
  item: S-0009
status: resolved
participants: [planner-S-0009, agent-S-0009]
created: 2026-11-06T17:52:33Z
updated: 2026-11-06T18:37:01Z
---

# TH-0011 S-0009 plan: five tasks in three layers

On wip/kanban/stories/S-0009-chronicle-verifies-the-es256-internal-jwt-portcullis-mints.md.

## Entries

### 2026-11-06T17:52:33Z planner-S-0009
S-0009 now has its touches, a 6h forecast, the tag `chronicle`, and five backlog tasks. Its cost of delay waits on TH-0007.

## Tasks and layers

| Layer | Task | What it delivers | Criteria |
|---|---|---|---|
| 1 | T-0034 | Chronicle verifies ES256 per tenant through `authstarFastifyPlugin` + `perTenantJwksKeyProvider`, with a tower-backed domain resolver (herald's pattern); secret and default removed from config; behavior and e2e specs on an ES256 fixture; dependency in `design/tech/tech-stack.md` | 1, 2 (config), 3 (tests) |
| 2 | T-0036 (after T-0034) | Integration specs and `chronicle/TESTING.md` on the ES256 fixture | 3 (tests) |
| 2 | T-0037 (after T-0034) | Chart and integration config/secrets/manifests drop the secret and gain `towerBaseUrl` | 2 (chart, manifests) |
| 3 | T-0038 (after T-0037, T-0036) | Golden path step 6 reads the report through portcullis with the forwarded ES256 token; in-cluster JWKS host; README gap removed | 3 (harness) |
| 3 | T-0039 (after T-0037) | `docs/operators/chronicle-configuration.md`, the operators index, and `design/system/overview.md` | 4 |

## Assumptions

- Chronicle adopts `@bytepunx/authstar-fastify`, as herald does, rather than calling `verifyInternalJwt` from authstar-core directly. Both reuse the same verification, which is what criterion 1 asks for.
- Chronicle resolves a tenant's domain by calling tower's `GET /tenants/:slug` at `towerBaseUrl`, as herald and keep do. This adds one config field.
- A token whose `tenant` header differs from the path's tenant gets 403. That is what verifying per tenant means here.
- The golden path's genuine token comes from a portcullis application in the harness whose upstream is chronicle, reached with step 2's session cookie. Web has no chronicle caller to go through.
- The scripted login's account holds `analytics:read` through tower's admin provisioning.

## Risks

- T-0038 is the unproven part. Chronicle must reach `https://authstar.<domain>/.well-known/jwks.json` from inside the cluster. The harness has no in-cluster DNS for tenant hosts (README "Not yet done"), and portcullis listens plain HTTP on 3710. If the fix needs TLS termination or portcullis code beyond config, I would split criterion 3's harness half into its own story under E-0003. I propose that only if T-0038 hits it; I have not changed the story's words.
- Like S-0006's criterion 3, the harness step may not be runnable in the agent's session without k3d. T-0038 then leaves criterion 3 unticked with the reason in Notes.

## Proposed changes

None to split, merge, or drop now. The story has no `after`: it reads nothing S-0010 writes.

### 2026-11-06T17:54:31Z agent-S-0009
Plan accepted as written: five tasks in three layers (T-0034; T-0036 and T-0037; T-0038 and T-0039). Working it now. If T-0038 needs portcullis code or TLS termination beyond config, I will raise it here before widening scope.

### 2026-11-06T18:37:01Z agent-S-0009
Resolved: Plan worked; T-0038 replaced by T-0086 after TH-0021.
