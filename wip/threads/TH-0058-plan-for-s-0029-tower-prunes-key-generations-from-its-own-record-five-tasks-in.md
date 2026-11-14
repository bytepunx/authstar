---
id: TH-0058
title: "Plan for S-0029: tower prunes key generations from its own record, five tasks in four layers"
anchor:
  path: wip/kanban/stories/S-0029-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md
  item: S-0029
status: open
participants: [planner-S-0029]
created: 2026-11-14T10:11:54Z
updated: 2026-11-14T10:11:54Z
---

# TH-0058 Plan for S-0029: tower prunes key generations from its own record, five tasks in four layers

On wip/kanban/stories/S-0029-signet-refuses-getserviceconfig-on-the-workload-listener-which-tower-s.md.

## Entries

### 2026-11-14T10:11:54Z planner-S-0029
Question: which fix? Recommended: fix tower, not signet. Tower stops reading portcullis's config. Its tenant actor records the key generations tower writes, and rotate-keys prunes from that record with `test`-guarded removals.

Why: signet's workload listener admits only SyncBundle, PatchServiceConfig, PutServiceConfig, and GetSOPSPublicKey (`workloadGitOpsScopeAllowedMethods` in signet's `server/internal/server/server.go`). Leaving GetServiceConfig out looks deliberate. Adding it would be a change to bytepunx/signet, which no task here can make.

Alternative: signet admits GetServiceConfig on the workload listener, scoped by policy. This story would then only bump the signet version and verify live. T-0157 would be cancelled, and T-0151 and T-0166 rewritten.

The tasks below assume the recommendation. Tasks and layers:

| Layer | Task | After |
|-------|------|-------|
| 1 | T-0151 ADR: tower never reads portcullis's config and prunes from its own record; story 011 updated | none |
| 1 | T-0157 Tenant actor records key generations; provisioning records identity-hash generation 1 | none |
| 2 | T-0166 Rotate-keys records and prunes from the record; `getConfig` removed from the signet client and fake; spec reproduces I-0025 | T-0157 |
| 3 | T-0169 Golden-path scenario rotates the new tenant's identity-hash key on a real signet and finds no prune failure in tower's log | T-0166 |
| 4 | T-0170 `flai issue close I-0025` | T-0151, T-0169 |

Assumptions:

- Tower prunes only the generations it recorded. A generation written by the harness's GitOps file, or by a tenant provisioned before this change, is never pruned by tower.
- Retention is judged by the next generation's `effectiveFrom`, not by `version`. Today's rule treats `version` as a Unix time. Provisioning writes identity-hash generation 1 with version 1, so once pruning works, the first rotation would drop generation 1 inside its retention window. T-0166 fixes this.
- The live step rotates identity-hash only. Provisioning writes no `sessionKeyGenerations` or `internalKeyGenerations` array, so a session or internal rotation on a fresh tenant may fail its append against signet's strict `add`. I have not checked this. It is outside this story; I can file it as an issue if you want.
- The ADR number 0113 is a guess, since S-0007 takes 0112. T-0151 renames the file if the number differs.

Figures:

- Forecast 3h, up from flai's 24m. Reason: five tasks plus a kluster deploy and checks run.
- Cost of delay 75 USD a week, from the inputs, not adjusted.
