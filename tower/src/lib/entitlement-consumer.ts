import type { ConsequentApi } from './consequent-types.js'

// Per ADR 0038 (keep's Stripe-driven producer side) / ADR 0031 (the
// concrete `entitlement.<eventType>` contract). Mirrors herald's own
// `comms-consumer.ts` `ChannelLike` convention exactly: a minimal
// structural interface, not `amqplib`'s own `Channel` type, so behavior/e2e
// tests can drive real consume/ack/nack sequencing against a fake channel
// with no broker running. The real `amqplib` wiring (connect, exchange/queue
// assert+bind to `entitlement.#`) lives in `src/server.ts` only.
//
// Unlike herald's comms consumer, this one needs the message's routing key
// (`entitlement.<eventType>`) to know which event type arrived -- the
// envelope itself carries no `type`/`eventType` field of its own per ADR
// 0031's examples.
export interface ConsumedMessage {
  content: Buffer
  fields: { routingKey: string }
}

export interface ChannelLike {
  consume(queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown>
  ack(msg: ConsumedMessage): void
  nack(msg: ConsumedMessage, allUpTo: boolean, requeue: boolean): void
}

export interface EntitlementConsumerDeps {
  consequent: ConsequentApi
}

interface RoleRef {
  name: string
  scope: 'tenant' | { application: string }
}

interface EntitlementEnvelope {
  tenant: string
  scope: { account: string } | { tenant: string }
  sequence?: number
  role?: RoleRef
  roles?: RoleRef[]
  grantedRoles?: RoleRef[]
  trialExpiresAt?: string
  seatLimit?: number | null
}

function accountIdFrom(scope: EntitlementEnvelope['scope']): string | undefined {
  return 'account' in scope ? scope.account : undefined
}

function tenantIdFrom(scope: EntitlementEnvelope['scope']): string | undefined {
  return 'tenant' in scope ? scope.tenant : undefined
}

// Idempotent, defensive, set-membership translation from keep's open
// `entitlement.*` vocabulary into commands against the target `account`/
// `tenant` actor -- ADR 0038's own layered ordering defense (idempotent
// handlers first, consequent's per-actor command queue second, invariant
// checks third, the `sequence` field available-but-not-mandatory fourth).
// This pilot slice relies on the first two layers only (sufficient given
// `account.ts`'s grant/revoke event handlers are already idempotent
// set-membership operations) -- `sequence`-based gap detection is
// deliberately not implemented; see TESTING.md.
//
// Unrecognized event types are logged and ignored, not an error -- ADR
// 0031's vocabulary is explicitly open/extensible.
export async function handleEntitlementEvent(
  consequent: ConsequentApi,
  eventType: string,
  payload: EntitlementEnvelope,
): Promise<void> {
  switch (eventType) {
    case 'role-granted': {
      const accountId = accountIdFrom(payload.scope)
      if (!accountId || !payload.role) return
      await consequent.handle(accountId, 'account.grant-role', { role: payload.role })
      return
    }
    case 'role-revoked': {
      const accountId = accountIdFrom(payload.scope)
      if (!accountId || !payload.role) return
      await consequent.handle(accountId, 'account.revoke-role', { role: payload.role })
      return
    }
    case 'trial-granted':
    case 'trial-extended': {
      const accountId = accountIdFrom(payload.scope)
      if (!accountId || !payload.role || !payload.trialExpiresAt) return
      await consequent.handle(accountId, 'account.grant-trial-role', {
        role: payload.role,
        trialExpiresAt: payload.trialExpiresAt,
      })
      return
    }
    case 'converted-to-paid': {
      const accountId = accountIdFrom(payload.scope)
      if (!accountId) return
      const roles = payload.grantedRoles ?? payload.roles ?? (payload.role ? [payload.role] : [])
      await Promise.all(roles.map((role) => consequent.handle(accountId, 'account.grant-role', { role })))
      return
    }
    case 'seat-limit-changed': {
      const tenant = tenantIdFrom(payload.scope) ?? payload.tenant
      if (!tenant) return
      await consequent.handle(tenant, 'tenant.set-seat-limit', { seatLimit: payload.seatLimit ?? null })
      return
    }
    default:
      // Open vocabulary (ADR 0031) -- an event type this pilot slice
      // doesn't yet translate is not an error.
      return
  }
}

export async function startEntitlementConsumer(
  channel: ChannelLike,
  queue: string,
  deps: EntitlementConsumerDeps,
): Promise<void> {
  await channel.consume(queue, (msg) => {
    if (!msg) return

    let payload: EntitlementEnvelope
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as EntitlementEnvelope
    } catch {
      channel.nack(msg, false, false) // malformed -- dead-letter, don't requeue forever
      return
    }

    const eventType = msg.fields.routingKey.replace(/^entitlement\./, '')
    handleEntitlementEvent(deps.consequent, eventType, payload)
      .then(() => channel.ack(msg))
      .catch(() => channel.nack(msg, false, true)) // transient failure -- requeue for redelivery
  })
}
