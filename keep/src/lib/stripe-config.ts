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

// ADR 0107: the number of failed payment attempts on one invoice at which
// keep degrades a subscription's plan roles, when the tenant never set its own.
export const DEFAULT_PAYMENT_FAILURE_ATTEMPTS = 3

// Stores a tenant's Stripe secrets and its non-secret billing settings.
export interface StripeConfigStore {
  get(tenantSlug: string): Promise<TenantStripeConfig | undefined>
  set(tenantSlug: string, config: TenantStripeConfig): Promise<void>
  // The tenant's own `paymentFailureAttempts` (ADR 0107), or undefined when it never set one.
  getPaymentFailureAttempts(tenantSlug: string): Promise<number | undefined>
  // Stores the tenant's `paymentFailureAttempts`, an integer of 1 or more.
  setPaymentFailureAttempts(tenantSlug: string, attempts: number): Promise<void>
}

// The tenant's grace threshold in effect: its own setting, else the default of 3 (ADR 0107).
export async function effectivePaymentFailureAttempts(store: StripeConfigStore, tenantSlug: string): Promise<number> {
  return (await store.getPaymentFailureAttempts(tenantSlug)) ?? DEFAULT_PAYMENT_FAILURE_ATTEMPTS
}

// Reads a stored threshold back: an integer of 1 or more, else undefined.
export function parsePaymentFailureAttempts(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw.trim())) return undefined
  return Number(raw.trim())
}

export function createInMemoryStripeConfigStore(): StripeConfigStore {
  const configs = new Map<string, TenantStripeConfig>()
  const attempts = new Map<string, number>()
  return {
    async get(tenantSlug: string): Promise<TenantStripeConfig | undefined> {
      return configs.get(tenantSlug)
    },
    async set(tenantSlug: string, config: TenantStripeConfig): Promise<void> {
      configs.set(tenantSlug, config)
    },
    async getPaymentFailureAttempts(tenantSlug: string): Promise<number | undefined> {
      return attempts.get(tenantSlug)
    },
    async setPaymentFailureAttempts(tenantSlug: string, value: number): Promise<void> {
      attempts.set(tenantSlug, value)
    },
  }
}
