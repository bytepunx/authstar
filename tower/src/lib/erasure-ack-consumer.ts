import type { ConsequentApi } from './consequent-types.js'
import type { ChannelLike, ConsumedMessage } from './entitlement-consumer.js'

export type { ChannelLike, ConsumedMessage }

// Per ADR 0026: tower's own producer/tracking role in the erasure cascade
// includes consuming `contact.purge.acknowledged { tenant, contactId, service }`
// from every subscriber (herald, keep, ...) that purged its own copy of a
// purged contact's PII, and appending `service` to the matching
// `erasureRequest` actor's `acknowledgedBy` set. Same `ChannelLike`
// structural-fake convention as `entitlement-consumer.ts`/herald's
// `comms-consumer.ts`.
export interface ErasureAckConsumerDeps {
  consequent: ConsequentApi
}

interface AcknowledgementEnvelope {
  tenant: string
  contactId: string
  service: string
}

export async function startErasureAckConsumer(
  channel: ChannelLike,
  queue: string,
  deps: ErasureAckConsumerDeps,
): Promise<void> {
  await channel.consume(queue, (msg: ConsumedMessage | null) => {
    if (!msg) return

    let payload: AcknowledgementEnvelope
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as AcknowledgementEnvelope
    } catch {
      channel.nack(msg, false, false)
      return
    }

    if (!payload.contactId || !payload.service) {
      channel.nack(msg, false, false)
      return
    }

    deps.consequent
      .handle(payload.contactId, 'erasureRequest.acknowledge', { service: payload.service })
      .then(() => channel.ack(msg))
      .catch(() => channel.nack(msg, false, true))
  })
}
