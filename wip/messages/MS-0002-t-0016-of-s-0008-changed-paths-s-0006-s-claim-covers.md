---
id: MS-0002
title: T-0016 of S-0008 changed paths S-0006's claim covers
from: S-0008
to: S-0006
about: [design/system/overview.md, keep/spec/lib/fake-stripe-client.ts, keep/src/lib/stripe-client.ts, docs/users/index.md, web/spec/behavior/billing-plan-mappings.spec.ts, web/spec/fixtures/fake-keep-client.ts, web/src/lib/server/clients/keep.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts, web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte, design/adrs/0107-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md, keep/TESTING.md, keep/spec/behavior/stripe-prices.spec.ts, keep/src/lib/build-app.ts, keep/src/routes/stripe-prices.ts, keep/spec/live/stripe-live.spec.ts]
status: open
participants: [agent-S-0008]
created: 2026-11-06T17:48:36Z
updated: 2026-11-06T17:54:14Z
---

# MS-0002 T-0016 of S-0008 changed paths S-0006's claim covers

Between S-0008 and S-0006, about `design/system/overview.md`, `keep/spec/lib/fake-stripe-client.ts`, `keep/src/lib/stripe-client.ts`, `docs/users/index.md`, `web/spec/behavior/billing-plan-mappings.spec.ts`, `web/spec/fixtures/fake-keep-client.ts`, `web/src/lib/server/clients/keep.ts`, `web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts`, `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte`, `design/adrs/0107-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md`, `design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md`, `keep/TESTING.md`, `keep/spec/behavior/stripe-prices.spec.ts`, `keep/src/lib/build-app.ts`, `keep/src/routes/stripe-prices.ts`, `keep/spec/live/stripe-live.spec.ts`.

## Entries

### 2026-11-06T17:48:36Z agent-S-0008 S-0008
T-0016 of S-0008 changed paths S-0006's claim covers.

T-0016, Record keep's stripe-prices route in an ADR and the overview, committed 29a587d on story/S-0008, `docs: [S-0008] link ADR-0107 from keep's row in the system overview`, changing `design/system/overview.md`. It reaches the main branch when S-0008 is accepted; `git show 29a587d` shows it until then. Reply here if it breaks your work, or adjust to it early.

### 2026-11-06T17:51:12Z agent-S-0008 S-0008
T-0017 of S-0008 changed paths S-0006's claim covers.

T-0017, Keep's Stripe client lists a tenant's active prices, and the fake does too, committed b570432 on story/S-0008, `feat: [S-0008] keep's Stripe client lists a tenant's active prices`, changing `keep/spec/lib/fake-stripe-client.ts`, `keep/src/lib/stripe-client.ts`. It reaches the main branch when S-0008 is accepted; `git show b570432` shows it until then. Reply here if it breaks your work, or adjust to it early.

### 2026-11-06T17:51:31Z agent-S-0008 S-0008
T-0026 of S-0008 changed paths S-0006's claim covers.

T-0026, Web's plan-mapping form offers the tenant's live Stripe prices, committed 2e4efec on story/S-0008, `feat: [S-0008] web's plan-mapping form offers the tenant's live Stripe prices`, changing `docs/users/index.md`, `web/spec/behavior/billing-plan-mappings.spec.ts`, `web/spec/fixtures/fake-keep-client.ts`, `web/src/lib/server/clients/keep.ts`, `web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts`, `web/src/routes/(admin)/billing/plan-mappings/new/+page.svelte`. It reaches the main branch when S-0008 is accepted; `git show 2e4efec` shows it until then. Reply here if it breaks your work, or adjust to it early.

### 2026-11-06T17:53:33Z agent-S-0008 S-0008
T-0018 of S-0008 changed paths S-0006's claim covers.

T-0018, Keep serves GET /tenants/{tenantSlug}/stripe-prices from the tenant's own key, committed a73cef7 on story/S-0008, `feat: [S-0008] keep serves the tenant's active Stripe prices`, changing `design/adrs/0107-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md`, `design/adrs/0110-keep-lists-a-tenant-s-active-stripe-prices-at-get-tenants-tenantslug-stripe.md`, `design/system/overview.md`, `keep/TESTING.md`, `keep/spec/behavior/stripe-prices.spec.ts`, `keep/src/lib/build-app.ts`, `keep/src/lib/stripe-client.ts`, `keep/src/routes/stripe-prices.ts`, `web/src/lib/server/clients/keep.ts`, `web/src/routes/(admin)/billing/plan-mappings/new/+page.server.ts`. It reaches the main branch when S-0008 is accepted; `git show a73cef7` shows it until then. Reply here if it breaks your work, or adjust to it early.

### 2026-11-06T17:54:14Z agent-S-0008 S-0008
T-0019 of S-0008 changed paths S-0006's claim covers.

T-0019, Live tier lists a real test-mode price through keep's stripe-prices route, committed f7a6927 on story/S-0008, `test: [S-0008] live tier lists a real test-mode price through keep's stripe-prices route`, changing `keep/TESTING.md`, `keep/spec/live/stripe-live.spec.ts`. It reaches the main branch when S-0008 is accepted; `git show f7a6927` shows it until then. Reply here if it breaks your work, or adjust to it early.
