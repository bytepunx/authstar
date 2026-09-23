// Publishing side of ADR 0031's entitlement events. Per
// design/docs/tech-stack.md: "publishing to RabbitMQ is application code,
// not consequent's job" -- a service calls `consequent.handle(...)`, gets
// back the events that actually occurred, and only *then*, outside
// consequent, decides what to publish (best-effort, no outbox pattern,
// every downstream consumer already built for idempotent redelivery).
//
// This interface is that "then decide what to publish" seam, injectable so
// tests can assert exactly what would have gone out over RabbitMQ without
// needing a real broker. Production wiring (`createAmqpEntitlementPublisher`,
// not implemented in this pilot slice -- see TESTING.md) would wrap
// `amqplib`/`amqp-connection-manager` per design/docs/tech-stack.md.

// ADR 0100: {organization} publishes straight to the organization itself
// (tower's organization.grant-role/revoke-role/set-seat-limit, consumed in
// entitlement-consumer.ts) -- no fan-out to individual accounts. This is
// what keeps org-purchased entitlement on the organization record only,
// never merged onto any member's own account.roles.
export type EntitlementScope = { account: string } | { tenant: string } | { organization: string }

export interface RoleGrantedEvent {
  type: 'entitlement.role-granted'
  tenant: string
  scope: EntitlementScope
  sequence: number
  role: { name: string, scope: string }
}

export interface RoleRevokedEvent {
  type: 'entitlement.role-revoked'
  tenant: string
  scope: EntitlementScope
  sequence: number
  role: { name: string, scope: string }
}

export interface ConvertedToPaidEvent {
  type: 'entitlement.converted-to-paid'
  tenant: string
  scope: EntitlementScope
  sequence: number
}

export interface SeatLimitChangedEvent {
  type: 'entitlement.seat-limit-changed'
  tenant: string
  // Never {account} -- an individual account has no seats to limit.
  scope: { tenant: string } | { organization: string }
  sequence: number
  seatLimit: number
}

export interface TrialGrantedEvent {
  type: 'entitlement.trial-granted'
  tenant: string
  scope: EntitlementScope
  sequence: number
  role: { name: string, scope: string }
}

export interface TrialExtendedEvent {
  type: 'entitlement.trial-extended'
  tenant: string
  scope: EntitlementScope
  sequence: number
  newExpiresAt: string
}

export interface UsageUpdatedEvent {
  type: 'entitlement.usage-updated'
  tenant: string
  scope: EntitlementScope
  application: string
  meter: string
  periodUsage: number
  periodLimit: number | null
  sequence: number
}

// design/decisions/0101-api-keys.md. Kept as two separate event types
// (not merged into one), mirroring `SeatLimitChangedEvent`'s own shape --
// but, unlike that event, `scope` here is the full `EntitlementScope`
// (`{account}` included), not the narrower `{tenant}|{organization}`
// `SeatLimitChangedEvent` deliberately restricts itself to. An individual
// account's own API-key allowance is meaningful (unlike seats, which only
// make sense at organization/tenant scale) -- a real, explicit divergence
// from the `seatLimit` template, not an oversight.
export interface ApiKeyLimitChangedEvent {
  type: 'entitlement.api-key-limit-changed'
  tenant: string
  scope: EntitlementScope
  sequence: number
  apiKeyLimit: number | null
}

export interface ApiKeyRateLimitChangedEvent {
  type: 'entitlement.api-key-rate-limit-changed'
  tenant: string
  scope: EntitlementScope
  sequence: number
  apiKeyRateLimit: { requestsPerMinute: number, burst?: number } | null
}

export type EntitlementEvent =
  | RoleGrantedEvent
  | RoleRevokedEvent
  | ConvertedToPaidEvent
  | SeatLimitChangedEvent
  | TrialGrantedEvent
  | TrialExtendedEvent
  | UsageUpdatedEvent
  | ApiKeyLimitChangedEvent
  | ApiKeyRateLimitChangedEvent

export interface EntitlementPublisher {
  publish(event: EntitlementEvent): Promise<void>
}

// One monotonically-increasing sequence per (tenant, scope) -- not per event
// type (Story 002) -- since ADR 0031's ordering-defense tooling assumes a
// single sequence space a consumer can detect gaps against.
//
// `next` is async (was a synchronous in-memory counter) since the real
// implementation (`consequent-sequence-provider.ts`) is now backed by a
// durable `entitlementSequence` consequent actor, surviving a restart --
// see that file's own header comment. `createInMemorySequenceProvider`
// below stays synchronous internally but returns a resolved promise; every
// existing test that only needs "some SequenceProvider, no real durability
// concern" keeps using it unchanged.
export interface SequenceProvider {
  next(tenant: string, scope: EntitlementScope): Promise<number>
}

export function scopeKey(scope: EntitlementScope): string {
  if ('account' in scope) return `account:${scope.account}`
  if ('organization' in scope) return `organization:${scope.organization}`
  return `tenant:${scope.tenant}`
}

export function createInMemorySequenceProvider(): SequenceProvider {
  const counters = new Map<string, number>()
  return {
    async next(tenant: string, scope: EntitlementScope): Promise<number> {
      const key = `${tenant}:${scopeKey(scope)}`
      const value = (counters.get(key) ?? 0) + 1
      counters.set(key, value)
      return value
    },
  }
}

// In-memory publisher used by every non-integration test tier in this
// pilot -- captures every event so tests can assert exactly what was
// published, in order, without a real broker.
export function createInMemoryEntitlementPublisher(): EntitlementPublisher & { published: EntitlementEvent[] } {
  const published: EntitlementEvent[] = []
  return {
    published,
    async publish(event: EntitlementEvent): Promise<void> {
      published.push(event)
    },
  }
}
