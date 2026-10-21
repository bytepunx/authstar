# Architecture Decision Records

One decision per file, numbered in order of acceptance. Never edit an accepted ADR except to set `superseded_by`. To change a decision, write a new ADR that supersedes it, then update the living design.

Record a new one with `flai adr new "<title>"`, or from the dashboard's ADRs page: the number, the file, its front matter, and the row below are made for you, from the sections in `0000-template.md`. `flai check` warns when a file has no row here or a row has no file.

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-claims-enrichment-via-tower.md) | Claims Enrichment via Tower | accepted |
| [0002](0002-multi-tenant-architecture-and-key-management.md) | Multi-Tenant Architecture and Per-Tenant Key Management | accepted |
| [0003](0003-enrichment-outcome-response-contract.md) | Enrichment Outcome Response Contract | accepted |
| [0004](0004-signet-for-configuration-and-secrets.md) | Configuration and Secrets via Signet (Hard Dependency) | accepted |
| [0005](0005-kluster-for-local-development-and-testing.md) | kluster for Local Development and Testing | accepted |
| [0006](0006-rabbitmq-as-message-broker.md) | RabbitMQ as the Inter-Service Message Broker | accepted |
| [0007](0007-signet-tenant-namespace-mapping.md) | Signet Tenant/Namespace Mapping and Automated Tenant Onboarding | superseded |
| [0008](0008-rabbitmq-identity-without-native-spiffe.md) | RabbitMQ Access Without Native SPIFFE Support | accepted |
| [0009](0009-tenant-data-via-syncbundle-no-github.md) | Tenant Config and Secrets via SyncBundle — No GitHub Dependency | accepted |
| [0010](0010-kickr-for-rabbitmq-container.md) | kickr as RabbitMQ's Container Entrypoint | accepted |
| [0011](0011-minimizing-towers-signet-footprint.md) | Minimizing Tower's Signet Configuration Footprint | accepted |
| [0012](0012-rabbitmq-user-provisioning-job.md) | RabbitMQ User Provisioning via a One-Shot Kubernetes Job | accepted |
| [0013](0013-tenant-discovery.md) | Tenant Discovery via Signet | superseded |
| [0014](0014-single-bundle-prefixed-tenant-keys.md) | Single Bundle with Prefixed Tenant Keys | accepted |
| [0015](0015-exempt-routes-never-blocked.md) | Exempt Routes Are Never Blocked by the Enrichment Outcome | accepted |
| [0016](0016-application-layer-and-sso-scope.md) | Application Layer Nested Within Tenant; SSO Scope Limited to Shared-Parent-Domain | accepted |
| [0017](0017-account-identity-and-role-model.md) | Account, Identity, and Role Model | accepted |
| [0018](0018-trial-roles-and-keep-boundary.md) | Trial Roles via Granted/Trial Split; Keep Stays Behind Web, Not Tower | accepted |
| [0019](0019-invite-codes.md) | Invite Codes as a Distinct, Multi-Redemption Mechanism | accepted |
| [0020](0020-tenant-application-actors-and-secret-handling.md) | Tenant and Application Actors; Secrets Never Persisted in Tower's Event Log | accepted |
| [0021](0021-cli-operator-bootstrap.md) | CLI-Driven Operator Bootstrap for Admins and OIDC Providers | accepted |
| [0022](0022-herald-communications-service.md) | `herald` — a Dedicated Communications Service | accepted |
| [0023](0023-pii-isolation-via-hashed-contact-records.md) | PII Isolation via HMAC-Hashed Contact Records | accepted |
| [0024](0024-contact-lifecycle-sync-to-herald.md) | Contact Lifecycle Sync to Herald; Plaintext + Hash in Send Requests | accepted |
| [0025](0025-versioned-templates-and-encrypted-payloads.md) | Versioned Templates and Encrypted Payloads in Herald | accepted |
| [0026](0026-erasure-cascade.md) | Erasure Cascade Across Services | accepted |
| [0027](0027-portcullis-computed-identity-hash.md) | Portcullis-Computed Identity Hash Replaces `idp_sub` Storage in Tower | accepted |
| [0028](0028-identity-hash-key-generations.md) | Multi-Generation Identity Hash Keys with Login-Time Reconciliation | accepted |
| [0029](0029-herald-payload-retention.md) | Encrypted Payload Retention in Herald | accepted |
| [0030](0030-tower-api-surface.md) | Tower's HTTP API Surface | accepted |
| [0031](0031-keep-tower-entitlement-events.md) | Keep → Tower Entitlement Message Contract | accepted |
| [0032](0032-per-tenant-sending-and-can-spam.md) | Per-Tenant Sending Adapters and CAN-SPAM Compliance | accepted |
| [0033](0033-herald-send-worker-and-retry.md) | Herald Send Worker, Retry, and Dead-Letter Handling | accepted |
| [0034](0034-herald-api-surface.md) | Herald's HTTP API Surface | accepted |
| [0035](0035-lookout-and-chronicle-analytics.md) | `lookout` and `chronicle` — Portcullis-Sourced Analytics | accepted |
| [0036](0036-chronicle-reporting-api-and-retention-config.md) | `chronicle`'s Reporting API and Retention Configuration | accepted |
| [0037](0037-stripe-connect-tenant-owned-merchant-accounts.md) | Stripe Connect Standard Accounts — Tenants Own the Merchant Relationship | superseded |
| [0038](0038-plan-mapping-and-subscription-tracking.md) | Plan-to-Entitlement Mapping and Subscription Tracking | accepted |
| [0039](0039-keep-trials-and-coupons.md) | Trials and Coupons in Keep | accepted |
| [0040](0040-keep-erasure-response.md) | Keep's Response to Contact Erasure | accepted |
| [0041](0041-keep-api-surface.md) | Keep's HTTP API Surface | accepted |
| [0042](0042-single-account-billing-model.md) | Single-Account Billing Model — Tenants Are Customers of the Installation | superseded |
| [0043](0043-application-reported-usage-metering.md) | Application-Reported Usage Metering | accepted |
| [0044](0044-web-surfaces-and-distribution-model.md) | `web`'s Three Surfaces and Distribution Model | accepted |
| [0045](0045-steward-operator-console.md) | `steward` — a Separate Operator Console, Distinct from Tenant Admin | accepted |
| [0046](0046-tenant-owned-stripe-configuration.md) | Tenant-Owned Stripe Configuration — Corrects the Single-Account Model | accepted |
| [0047](0047-application-and-role-slug-validation.md) | Application and Role Slug Validation — Tower-Owned Role Catalog, Keep's Async Reference Cache | accepted |
| [0048](0048-steward-ux.md) | `steward`'s UX — Screens, Flows, and Two New Tower Endpoints | accepted |
| [0049](0049-web-admin-information-architecture.md) | `web`'s Admin Surface — Information Architecture | accepted |
| [0050](0050-portal-reserved-application.md) | `_portal` — a Second Reserved Application for Hosted Login and Billing Pages | superseded |
| [0051](0051-web-applications-and-identity-access-screens.md) | `web`'s Applications and Identity & Access Screens | accepted |
| [0052](0052-keep-herald-own-signet-access.md) | Keep and Herald Gain Narrow Signet Access for Self-Managed Tenant Secrets | accepted |
| [0053](0053-lifecycle-status-consolidation.md) | Lifecycle State Transitions via `PATCH`, Not a Separate `DELETE` — Consolidated Fix | accepted |
| [0054](0054-web-billing-and-communications-screens.md) | `web`'s Billing and Communications Screens | accepted |
| [0055](0055-web-privacy-compliance-screens.md) | `web`'s Privacy & Compliance Screens | accepted |
| [0056](0056-gdpr-data-export.md) | Data Export — Right of Access and Portability (GDPR Article 15/20) | accepted |
| [0057](0057-web-data-export-screen.md) | `web`'s Data Export Screen | accepted |
| [0058](0058-analytics-event-shape-corrections.md) | Analytics Event Shape Corrections for the Auth Funnel Report | accepted |
| [0059](0059-web-analytics-screens.md) | `web`'s Analytics Screens | accepted |
| [0060](0060-activity-feed-and-revenue-summary.md) | Cross-Service Activity Feed and Keep's Revenue Summary | accepted |
| [0061](0061-web-overview-screen.md) | `web`'s Overview Screen | accepted |
| [0062](0062-tenant-status-enforcement-and-reactivation.md) | Tenant Status Enforcement, Suspension, and Reactivation | accepted |
| [0063](0063-web-settings-screen.md) | `web`'s Settings Screen | accepted |
| [0064](0064-portal-signin-flow.md) | `_portal`'s Sign-In Flow — Application-Scoped, Fully Client-Fetchable | superseded |
| [0065](0065-portal-upgrade-flow.md) | The Upgrade/Checkout Flow | accepted |
| [0066](0066-portcullis-proxies-branded-pages-to-web.md) | Portcullis Proxies Branded Pages to `web` — Same Host, No Redirect, No `_portal` | accepted |
| [0067](0067-tenant-creation-and-provisioning.md) | Tenant Creation and Provisioning API | accepted |
| [0068](0068-tenant-creation-ui-surfaces.md) | Tenant Creation UI — `web`'s Public Signup Page and `steward`'s Create-Tenant Screen | accepted |
| [0069](0069-role-interpretation-is-application-owned.md) | Role Interpretation Is Permanently Application-Owned | accepted |
| [0070](0070-self-service-identity-linking.md) | Self-Service Identity Linking | accepted |
| [0071](0071-self-service-widget-data-access.md) | Self-Service Widget Data Access — the `/_authstar/me/*` Proxy Family | accepted |
| [0072](0072-embeddable-web-component-inventory.md) | Embeddable Web Component Inventory | accepted |
| [0073](0073-provider-discovery-status-feedback.md) | Provider Discovery Status Feedback | accepted |
| [0074](0074-herald-bounce-complaint-and-suppression.md) | Bounce/Complaint Handling and Suppression Lists | accepted |
| [0075](0075-stuck-erasure-request-monitoring.md) | Stuck Erasure Request Monitoring | accepted |
| [0076](0076-admin-initiated-email-change.md) | Admin-Initiated Email Change | accepted |
| [0077](0077-keep-refunds-and-disputes.md) | Keep Refund and Dispute Handling | accepted |
| [0078](0078-herald-template-branding.md) | Per-Tenant/Per-Application Template Branding | accepted |
| [0079](0079-batched-usage-reporting-credentials.md) | Durable Credentials for Batched Usage Reporting | accepted |
| [0080](0080-tenant-key-rotation-ceremony.md) | Tenant Key Rotation Ceremony | accepted |
| [0081](0081-herald-key-rotation.md) | Herald Key Rotation | accepted |
| [0082](0082-tower-actor-boundary-corrections.md) | Tower Actor Boundary Corrections — `provider`, `inviteCode`, `invite` | accepted |
| [0083](0083-keep-actor-boundary-corrections.md) | Keep Actor Boundary Corrections — Keys, Missing Fields, and a Stale Contradiction | accepted |
| [0084](0084-herald-actor-boundary-corrections.md) | Herald Actor Boundary Corrections — Keys Finally Declared | accepted |
| [0085](0085-chronicle-clickhouse-schema.md) | Chronicle's ClickHouse Schema | accepted |
| [0086](0086-jwks-endpoint-for-internal-jwt-verification.md) | JWKS Endpoint for Internal JWT Verification | accepted |
| [0087](0087-jwks-response-includes-pem-alongside-jwk-point.md) | JWKS Response Includes the PEM-Encoded Public Key Alongside the JWK Point | accepted |
| [0088](0088-session-internal-key-rotation-overlap.md) | Session/Internal Key Rotation-with-Overlap | accepted |
| [0089](0089-internal-jwt-carries-its-own-tenant-hint.md) | The Internal JWT Carries Its Own Tenant Hint | accepted |
| [0090](0090-organizations-shared-billing-administration-and-succession.md) | Organizations — Shared Billing Administration and Succession | superseded |
| [0091](0091-tenant-owned-domains-and-the-authstar-admin-surface.md) | Tenant-Owned Domains and the Reserved `authstar` Admin Surface | accepted |
| [0092](0092-invite-redemption-survives-the-oauth-round-trip.md) | Invite Redemption Survives the OAuth Round Trip | accepted |
| [0093](0093-domain-pending-tenant-provisioning.md) | Domain-Pending Tenant Provisioning | accepted |
| [0094](0094-adopting-an-already-provisioned-tenant.md) | Adopting an Already-Provisioned Tenant | accepted |
| [0095](0095-portcullis-forwards-stripe-webhooks-to-keep.md) | Portcullis Forwards Stripe Webhooks to Keep | accepted |
| [0097](0097-cloudflared-tunnel-credentials-via-signet.md) | cloudflared Tunnel Credentials via Signet + kickr | accepted |
| [0098](0098-organization-permission-lifecycle.md) | Organization Permission Lifecycle and Entitlement Fan-Out | superseded |
| [0099](0099-hosted-tenant-brandable-ui-surfaces.md) | Hosted, Tenant-Brandable UI Surfaces for Platform-Owned Concepts | proposed |
| [0100](0100-organization-membership-and-open-role-catalog.md) | Multi-Organization Membership and an Open Org-Role Catalog | accepted |
| [0101](0101-api-keys.md) | API Keys — User-Scoped and Org-Scoped, Tenant-Plan-Gated | accepted |
| [0102](0102-signet-precedence-and-fallback-scope.md) | Signet Precedence, Fallback Scope, and Missing-Field Behavior | accepted |
| [0103](0103-spiffe-scoped-signet-writes-retire-admin-tokens.md) | SPIFFE-Scoped Self-Service Signet Writes, Retiring Admin Tokens | accepted |
| [0104](0104-helm-chart-and-provisioning-hook.md) | Helm Chart for authstar, with a Signet-Provisioning Hook | accepted |
| [0105](0105-signet-manifest-and-aggregated-onboarding-spec.md) | Per-Service Signet Manifests, Aggregated by authstar-chart | accepted |
| [0106](0106-design-records-live-in-the-system-flow-layout.md) | Design records live in the system-flow layout | accepted |
| [0107](0107-keep-mirrors-stripe-s-subscription-status-and-degrades-plan-roles-after-a-grace.md) | Keep mirrors Stripe's subscription status and degrades plan roles after a grace period | accepted, refines 0038 and 0077 |
| [0108](0108-plan-mappings-grant-roles-granted-roles-is-tower-s-set-in-effect.md) | Plan mappings grant roles; granted roles is tower's set in effect | accepted, refines 0018 and 0038 |
| [0109](0109-entitlement-scopes-are-accounts-and-organizations-the-tenant-scope-is-retired.md) | Entitlement scopes are accounts and organizations; the tenant scope is retired | accepted, refines 0031, 0046 and 0100 |
