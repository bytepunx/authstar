# Story 006 — OAuth2 Callback: Code Exchange and Userinfo Fetch

**Epic:** OAuth2 Authentication
**Repo:** portcullis
**Status:** Draft
**Adapted from:** `ref-design` Story 006 per [ADR 0001](../../decisions/0001-claims-enrichment-via-tower.md),
[ADR 0027](../../decisions/0027-portcullis-computed-identity-hash.md).

---

## Summary

After a user authenticates at the provider, portcullis validates state and PKCE, exchanges the
code for an access token, and fetches the user's identity from the provider's userinfo
endpoint — capturing both `email` **and** the provider's own immutable `sub`, per ADR 0001.

---

## Acceptance Criteria

- [ ] Each provider registers a `GET` handler at its derived `callbackPath` under the resolved
      application (same application/tenant scoping as Story 005, per ADR 0016).
- [ ] **State validation:** `oauth2-state` cookie compared against the `state` query parameter;
      mismatch or missing cookie → `400 Bad Request`. Cookie cleared immediately after
      validation regardless of outcome.
- [ ] **PKCE verifier retrieval:** `oauth2-pkce-verifier` cookie read and cleared immediately
      after reading; missing → `400 Bad Request`.
- [ ] The handler `POST`s to the provider's `token_endpoint` with `grant_type=authorization_code`,
      `code`, `redirect_uri` (must exactly match Story 005's), `client_id`, `client_secret`,
      and `code_verifier`.
- [ ] On a non-2xx token response: `500` generic message to the client; raw provider error
      logged at error level, never exposed.
- [ ] The handler calls `GET <userinfo_endpoint>` with `Authorization: Bearer <access_token>`.
- [ ] **Both `email` and `sub` are extracted from the userinfo response.** `sub` is the
      provider's own immutable opaque subject identifier — required for identity resolution per
      ADR 0001; `email` remains a required, separately-extracted field. If either is absent,
      the handler returns `500`.
- [ ] **`sub` is hashed immediately, never retained or forwarded raw** (ADR 0027): using the
      resolved tenant's `identity-hash-key` secret, portcullis computes
      `identityHash = HMAC-SHA256(identityHashKey, tenant + ':' + idp + ':' + sub)`. The raw
      `sub` value is discarded the moment this computation completes — it is not logged, not
      placed on any token, and not sent to tower.
- [ ] On success, the handler issues a session JWT (Story 008) carrying `sub = email`, `idp =
      <provider name>`, `identityHash = <computed above>`, and redirects per Story 007.

---

## Error Handling

| Scenario | Response |
|----------|----------|
| State mismatch / missing | `400 Bad Request` |
| PKCE verifier cookie missing | `400 Bad Request` |
| Token exchange HTTP error | `500` + generic message |
| Userinfo HTTP error | `500` + generic message |
| `email` or `sub` absent from userinfo | `500` + generic message |

---

## Notes

- All HTTP calls to the provider have a 10-second timeout — unchanged from `ref-design`.
- Do not log access tokens, client secrets, or the PKCE verifier at any log level — unchanged.
- The provider validates `code_verifier` against `code_challenge`; portcullis does not
  re-derive or check it itself — unchanged.
- This is the one deliberate behavioral change from `ref-design` Story 006: the original only
  extracted `email`. Capturing `sub` here is what makes ADR 0001's identity resolution
  possible — tower resolves the canonical account from `identityHash`, not from email, since
  email is mutable and not a safe cross-provider linking key.
- Per ADR 0027, `sub` itself never reaches tower at all — only the hash portcullis computes
  from it. Tower has no ability to recover the raw provider subject identifier under any
  circumstance.
