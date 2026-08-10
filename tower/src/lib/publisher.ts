// A minimal structural interface (not `amqplib`'s own `Channel` type),
// matching this codebase's own `ChannelLike` convention (see
// `entitlement-consumer.ts`/herald's `comms-consumer.ts`) -- lets
// behavior/e2e tests inject a fake publisher with no broker running, while
// `src/server.ts` wires a real one.
export interface Publisher {
  publish(routingKey: string, payload: unknown): Promise<void>
}

export interface AmqpChannelLike {
  publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean
}

export function createAmqpPublisher(channel: AmqpChannelLike, exchange: string): Publisher {
  return {
    async publish(routingKey, payload) {
      const content = Buffer.from(JSON.stringify(payload), 'utf8')
      channel.publish(exchange, routingKey, content, { contentType: 'application/json', persistent: true })
    },
  }
}

// A no-op publisher for contexts (default `buildApp()` wiring, existing
// tests that never call a route needing publishing) that don't care about
// RabbitMQ at all.
export function createNoopPublisher(): Publisher {
  return {
    async publish() {},
  }
}
