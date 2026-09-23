import type { EntitlementEvent, EntitlementPublisher } from './entitlement-publisher.js'

// Real `amqplib`-backed `EntitlementPublisher` -- the production wiring
// `entitlement-publisher.ts` itself documents as not-yet-built (TESTING.md:
// "no `createAmqpEntitlementPublisher` production wiring exists yet").
//
// Publishes onto the exact same durable topic exchange tower's own
// `entitlement-consumer.ts` binds `entitlement.#` against
// (`~/git/authstar/tower/src/server.ts`: `assertExchange('authstar',
// 'topic', { durable: true })`) -- keep is a producer-only participant on
// this exchange, so this file never asserts a queue or binding of its own,
// only (in `src/server.ts`) the exchange itself, matching tower's own
// idempotent `assertExchange` call so either service can boot first.
//
// `persistent: true` -- ADR 0006's quorum-queue, must-not-lose tier
// (business events), distinct from lookout/chronicle's deliberately
// non-durable analytics exchange (`~/git/authstar/lookout/src/lib/
// amqp-publisher.ts`). Matches tower's own `createAmqpPublisher`
// (`src/lib/publisher.ts`) exactly, just typed against keep's
// `EntitlementPublisher` interface instead of a bare `(routingKey,
// payload)` shape.
//
// Routing key is the event's own `type` field verbatim
// (`entitlement.<eventType>`, ADR 0031) -- no separate mapping table to
// drift out of sync with `entitlement-publisher.ts`'s own `EntitlementEvent`
// union. The published payload omits `type`: tower's `EntitlementEnvelope`
// (`entitlement-consumer.ts`) carries no `type`/`eventType` field of its
// own -- the routing key alone conveys which event arrived -- so this
// strips it before serializing rather than relying on the consumer to
// ignore an extra field it was never contractually promised.

export const ENTITLEMENT_EXCHANGE = 'authstar'

// A minimal structural interface, not `amqplib`'s own `Channel` type --
// same convention as `publisher.ts`'s `AmqpChannelLike` and
// `entitlement-consumer.ts`'s `ChannelLike` -- so this file has no direct
// compile-time dependency on `amqplib`'s types, only on the two methods it
// actually calls.
export interface AmqpChannelLike {
  publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean
}

export function createAmqpEntitlementPublisher(channel: AmqpChannelLike, exchange: string = ENTITLEMENT_EXCHANGE): EntitlementPublisher {
  return {
    async publish(event: EntitlementEvent): Promise<void> {
      const { type, ...envelope } = event
      const content = Buffer.from(JSON.stringify(envelope), 'utf8')
      channel.publish(exchange, type, content, { contentType: 'application/json', persistent: true })
    },
  }
}
