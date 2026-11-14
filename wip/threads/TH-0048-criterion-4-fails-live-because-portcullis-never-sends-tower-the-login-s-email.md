---
id: TH-0048
title: "Criterion 4 fails live because portcullis never sends tower the login's email, so no invite can be redeemed: fix portcullis in S-0017?"
anchor:
  path: wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md
  item: S-0017
status: resolved
participants: [agent-S-0017, bytepunx]
created: 2026-11-13T22:32:23Z
updated: 2026-11-14T09:30:30Z
---

# TH-0048 Criterion 4 fails live because portcullis never sends tower the login's email, so no invite can be redeemed: fix portcullis in S-0017?

On wip/kanban/stories/S-0017-golden-path-reads-chronicle-s-report-with-a-portcullis-forwarded-es256-token.md.

## Entries

### 2026-11-13T22:32:23Z agent-S-0017
Criteria 1, 2, 3, and 5 are verified live on s-0017 at b630f32. Criterion 4 fails with chronicle's `403 missing required permission: analytics:read`. Chronicle answers 401 to a token it cannot verify, so this 403 means it verified the portcullis-forwarded ES256 token through the TLS front. What is missing is the permission.

**Cause.**
- Portcullis's `/identities/resolve` body has no `email` field (`portcullis/crates/authstar-middleware/src/identities.rs`, `ResolveRequestBody`). The callback has the email from userinfo (`oauth/callback.rs`) but does not pass it.
- Tower then creates a new account's contact with `contactStore.upsert(tenant, body.email ?? '')` (`tower/src/routes/identities.ts`), which gives an empty-email contact.
- `redeemInvite` requires the account's contact to be the invite's. So the first-admin invite (ADR 0092) is never redeemed at any first login, and the account gets no permissions.
- Live in s-0017: acme has contact `8998e8a1…` (`admin@example.com`, the invite's) and `10810106…` (`""`, the account's).

Which do you want?

1. **Recommended: fix portcullis in S-0017.** Add `email` to `ResolveRequestBody` and `resolve_identity`, pass it from the callback, and add a test that fails without it. It touches `identities.rs` and `oauth/callback.rs`. S-0010 also changes `callback.rs`, so we agree a split on MS-0034. Then I tear down and redeploy s-0017, since its account is already bound to the empty contact, and rerun the chain.
2. **Split it.** A new remediation story fixes portcullis. S-0017 goes to review with criterion 4 unticked, and the reason is written in its notes.
3. **Something else**, such as an operator route that grants a permission, for the harness only.

Everything else is done. The close-out passed at e0f5521. I am waiting on this answer.

### 2026-11-14T05:01:49Z bytepunx
1

### 2026-11-14T09:30:30Z bytepunx
Resolved: S-0017 was accepted
