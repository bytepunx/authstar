import type { OrganizationManagerCache } from './organization-manager-cache.js'

// Per ADR 0098: keep consumes tower's `organization.manager-added`/
// `-removed`/`-succeeded` events to keep `organization-manager-cache.ts`
// current. Mirrors `role-reference-consumer.ts`'s `ChannelLike` convention
// exactly -- a minimal structural interface, not `amqplib`'s own `Channel`
// type, so behavior tests can drive real consume/ack/nack sequencing
// against a fake channel with no broker running. The real `amqplib` wiring
// (connect, exchange assert, queue assert+bind to `organization.#`) lives
// in `src/server.ts` only.

export interface ConsumedMessage {
  content: Buffer
  fields: { routingKey: string }
}

export interface ChannelLike {
  consume(queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown>
  ack(msg: ConsumedMessage): void
  nack(msg: ConsumedMessage, allUpTo: boolean, requeue: boolean): void
}

interface ManagerAddedPayload {
  organizationId: string
  tenant: string
  accountId: string
}

interface ManagerRemovedPayload {
  organizationId: string
  tenant: string
  accountId: string
}

interface ManagerSucceededPayload {
  organizationId: string
  tenant: string
  departingAccountId: string
  successorAccountId: string
}

export function handleOrganizationReferenceEvent(cache: OrganizationManagerCache, routingKey: string, payload: unknown): void {
  if (routingKey === 'organization.manager-added') {
    const event = payload as ManagerAddedPayload
    if (!event.organizationId || !event.accountId) return
    cache.addManager(event.organizationId, event.accountId)
    return
  }
  if (routingKey === 'organization.manager-removed') {
    const event = payload as ManagerRemovedPayload
    if (!event.organizationId || !event.accountId) return
    cache.removeManager(event.organizationId, event.accountId)
    return
  }
  if (routingKey === 'organization.manager-succeeded') {
    const event = payload as ManagerSucceededPayload
    if (!event.organizationId || !event.departingAccountId || !event.successorAccountId) return
    cache.removeManager(event.organizationId, event.departingAccountId)
    cache.addManager(event.organizationId, event.successorAccountId)
    return
  }
  // Any other routing key reaching this queue would be a binding mistake,
  // not a real event this consumer should ever see -- ignored, not an
  // error (same open-vocabulary tolerance role-reference-consumer.ts and
  // tower's own entitlement-consumer apply to unrecognized event types).
}

export async function startOrganizationReferenceConsumer(channel: ChannelLike, queue: string, cache: OrganizationManagerCache): Promise<void> {
  await channel.consume(queue, (msg) => {
    if (!msg) return

    let payload: unknown
    try {
      payload = JSON.parse(msg.content.toString('utf8'))
    } catch {
      channel.nack(msg, false, false) // malformed -- dead-letter, don't requeue forever
      return
    }

    try {
      handleOrganizationReferenceEvent(cache, msg.fields.routingKey, payload)
      channel.ack(msg)
    } catch {
      channel.nack(msg, false, true) // transient failure -- requeue for redelivery
    }
  })
}
