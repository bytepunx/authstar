import type { RoleReferenceCache } from './role-reference-cache.js'

// Per ADR 0047: keep consumes tower's `application.<created|hosts-changed|
// suspended|deleted>` and `roleDefinition.<created|retired>` events to keep
// `role-reference-cache.ts` current between backfills. Mirrors tower's own
// `entitlement-consumer.ts`/herald's `comms-consumer.ts` `ChannelLike`
// convention exactly: a minimal structural interface, not `amqplib`'s own
// `Channel` type, so behavior tests can drive real consume/ack/nack
// sequencing against a fake channel with no broker running. The real
// `amqplib` wiring (connect, exchange assert, queue assert+bind to
// `application.#`/`roleDefinition.#`) lives in `src/server.ts` only.
//
// Both event families carry their current `status` directly in the payload
// (tower's own `application.ts`/`role-definitions.ts` routes publish
// `{tenant, application, name, status}` / `{tenant, name, scope, status}`
// on every write, not just the specific transition) -- so this consumer
// never needs to switch on the event-name suffix (`created` vs
// `suspended` vs `deleted`, or `created` vs `retired`): it just upserts
// whatever the payload's own `status` says, uniformly, for every message on
// either routing-key family. `roleDefinition`'s `scope: 'tenant'` case is a
// deliberate no-op -- see role-reference-cache.ts's own header comment for
// why tenant-wide role definitions are never tracked here.
export interface ConsumedMessage {
  content: Buffer
  fields: { routingKey: string }
}

export interface ChannelLike {
  consume(queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown>
  ack(msg: ConsumedMessage): void
  nack(msg: ConsumedMessage, allUpTo: boolean, requeue: boolean): void
}

interface ApplicationEventPayload {
  tenant: string
  application: string
  name: string
  status: string
}

interface RoleDefinitionEventPayload {
  tenant: string
  name: string
  scope: 'tenant' | { application: string }
  status: string
}

export function handleRoleReferenceEvent(cache: RoleReferenceCache, routingKey: string, payload: unknown): void {
  if (routingKey.startsWith('application.')) {
    const event = payload as ApplicationEventPayload
    if (!event.tenant || !event.application) return
    cache.upsertApplication(event.tenant, event.application, event.status === 'active')
    return
  }
  if (routingKey.startsWith('roleDefinition.')) {
    const event = payload as RoleDefinitionEventPayload
    if (!event.tenant || !event.name || !event.scope) return
    if (event.scope === 'tenant') return // tenant-wide -- not tracked, see header comment
    cache.upsertRoleDefinition(event.tenant, event.scope.application, event.name, event.status === 'active')
    return
  }
  // Any other routing key reaching this queue would be a binding mistake,
  // not a real event this consumer should ever see -- ignored, not an
  // error (same open-vocabulary tolerance tower's own entitlement-consumer
  // applies to unrecognized event types).
}

export async function startRoleReferenceConsumer(channel: ChannelLike, queue: string, cache: RoleReferenceCache): Promise<void> {
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
      handleRoleReferenceEvent(cache, msg.fields.routingKey, payload)
      channel.ack(msg)
    } catch {
      channel.nack(msg, false, true) // transient failure -- requeue for redelivery
    }
  })
}
