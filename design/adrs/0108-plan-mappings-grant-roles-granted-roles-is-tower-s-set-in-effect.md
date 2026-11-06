---
id: ADR-0108
title: "Plan mappings grant roles; granted roles is tower's set in effect"
status: accepted
date: 2026-10-21
supersedes: []
superseded_by: []
refines: [ADR-0018, ADR-0038]
---

# ADR-0108 Plan mappings grant roles; granted roles is tower's set in effect

## Context

Two fields share one name. In tower, `account.grantedRoles` (ADR-0018) is the set of roles in effect regardless of any trial: the baseline that survives trial expiry and, per ADR-0038 and ADR-0077, survives non-payment ("degrade to `grantedRoles`-only"). In keep, `planMapping.grantedRoles` (ADR-0038, ADR-0046) is the list of roles a Stripe price grants, and the roles keep revokes on degrade. Read together, the ADRs say keep "degrades to grantedRoles-only" by revoking `grantedRoles`, which is a contradiction only in name: the roles a plan grants are added to tower's set when the subscription starts and removed from it when the subscription lapses, and whatever else is in tower's set stays. The 2026-10-20 audit read it as the implementation inverting the design; the loci migration issue (`bytepunx/authstar-keep#1`) shows external callers already writing `grantedRoles` in plan-mapping requests.

## Decision

Keep calls the roles a plan grants `roles`, tower keeps `grantedRoles` for the set in effect, and the degrade rule is stated in those terms.

- **Keep.** `planMapping.roles` replaces `planMapping.grantedRoles` in the actor, the HTTP API, and the web form. The API accepts `grantedRoles` on input as a deprecated alias until the next major release of keep, and always returns `roles`. The `entitlement.converted-to-paid` envelope carries `roles`; tower's consumer already reads that field.
- **Tower.** `account.grantedRoles` and `organization.grantedRoles` are unchanged: the roles in effect, from any source. `trialRoles` and `trialExpiresAt` are unchanged.
- **Degrade means:** keep publishes `entitlement.role-revoked` for each of the plan's `roles`; tower removes them from `grantedRoles` and `trialRoles`. Everything else in `grantedRoles` survives. The wording "degrade to `grantedRoles`-only" in ADR-0038 and ADR-0077 is read as "remove the plan's roles", and this ADR is the reference for that reading.
- **A role that is both plan-granted and admin-granted** is removed on degrade, because tower's grant and revoke are set operations with no provenance (ADR-0031). A tenant that wants a role to survive non-payment gives it a name no plan mapping uses, as ADR-0018's baseline example does. Web's plan-mapping form says so beside the role picker.

## Consequences

- One word, one meaning: `roles` on a plan, `grantedRoles` on an account or organization.
- Keep's API changes shape; the alias keeps loci's documented request bodies working.
- No change to tower's actors or the consumer beyond reading `roles` on `converted-to-paid`, which it does.
- Code: `keep/src/actors/plan_mapping_actor.ts`, `keep/src/routes/plan-mappings.ts`, `keep/src/routes/webhooks.ts`, `web/src/routes/(admin)/billing/plan-mappings/**`, `keep/TESTING.md`, `docs/users/`. S-0005 carries keep; the web form follows in S-0008.

## Alternatives considered

- Rename tower's field instead: `account.grantedRoles` is in the enrichment response, the internal JWT path, and the SDKs; far more callers than keep's plan-mapping API.
- Give tower provenance per role so a plan revoke cannot remove an admin grant: correct but adds a second set and a merge rule to every consumer of roles; not needed until a tenant asks for it.
- Leave the names and add a glossary: the audit shows the names mislead a careful reader; a glossary would not stop the next one.
