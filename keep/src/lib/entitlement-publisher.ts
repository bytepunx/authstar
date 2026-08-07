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

export type EntitlementScope = { account: string } | { tenant: string }

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
  scope: { tenant: string }
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

export type EntitlementEvent =
  | RoleGrantedEvent
  | RoleRevokedEvent
  | ConvertedToPaidEvent
  | SeatLimitChangedEvent
  | TrialGrantedEvent
  | TrialExtendedEvent
  | UsageUpdatedEvent

export interface EntitlementPublisher {
  publish(event: EntitlementEvent): Promise<void>
}

// One monotonically-increasing sequence per (tenant, scope) -- not per event
// type (Story 002) -- since ADR 0031's ordering-defense tooling assumes a
// single sequence space a consumer can detect gaps against.
//
// In-memory only in this pilot slice -- not durable across a process
// restart. A real deployment needs this backed by something that survives a
// restart (e.g. a dedicated `entitlementSequence` consequent actor, or a
// Postgres counter table); left as a follow-up, noted in TESTING.md, since
// no keep story specifies the backing mechanism yet.
export interface SequenceProvider {
  next(tenant: string, scope: EntitlementScope): number
}

function scopeKey(scope: EntitlementScope): string {
  return 'account' in scope ? `account:${scope.account}` : `tenant:${scope.tenant}`
}

export function createInMemorySequenceProvider(): SequenceProvider {
  const counters = new Map<string, number>()
  return {
    next(tenant: string, scope: EntitlementScope): number {
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
