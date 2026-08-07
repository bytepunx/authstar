// Resolves a tenant's own Stripe secret key + webhook secret. Per Story
// 001/006, the real values live in keep's own signet bundle
// (`tenant-<slug>-stripe-secret-key`/`tenant-<slug>-stripe-webhook-secret`),
// pushed there by the `stripe-config` PATCH route via `SyncBundle` (ADR
// 0052) -- never persisted in the consequent event log (`stripe-config` is
// explicitly "not an actor," Story 001).
//
// Real signet wiring (`@bytepunx/signet-client`) is out of scope for this
// pilot slice -- no signet bundle to dial in these tests, and building a
// fake signet client is a bigger yak than this slice's budget covers (see
// TESTING.md). This interface is the seam: production wiring reads/writes
// through signet, tests use `createInMemoryStripeConfigStore` directly.

export interface TenantStripeConfig {
  secretKey: string
  webhookSecret: string
}

export interface StripeConfigStore {
  get(tenantSlug: string): Promise<TenantStripeConfig | undefined>
  set(tenantSlug: string, config: TenantStripeConfig): Promise<void>
}

export function createInMemoryStripeConfigStore(): StripeConfigStore {
  const configs = new Map<string, TenantStripeConfig>()
  return {
    async get(tenantSlug: string): Promise<TenantStripeConfig | undefined> {
      return configs.get(tenantSlug)
    },
    async set(tenantSlug: string, config: TenantStripeConfig): Promise<void> {
      configs.set(tenantSlug, config)
    },
  }
}
