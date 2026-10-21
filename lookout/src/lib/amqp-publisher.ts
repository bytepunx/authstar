import amqplib from 'amqplib'
import type { Publisher } from './publisher.js'

// design/adrs/0035-lookout-and-chronicle-analytics.md: "non-durable,
// a different reliability tier than everything else on this broker" --
// analytics traffic accepts loss during a chronicle outage as a deliberate
// trade-off, not a reliability gap. One topic exchange; routing keys follow
// the event-type taxonomy directly (`analytics.<eventType>`), so consumers
// bind whatever slice of that taxonomy they care about rather than lookout
// maintaining a separate per-queue mapping.
const DEFAULT_EXCHANGE = 'analytics'

export interface AmqpPublisherOptions {
  url: string
  exchange?: string
}

export interface ClosablePublisher extends Publisher {
  close(): Promise<void>
}

export async function createAmqpPublisher(options: AmqpPublisherOptions): Promise<ClosablePublisher> {
  const exchange = options.exchange ?? DEFAULT_EXCHANGE
  const connection = await amqplib.connect(options.url)
  const channel = await connection.createChannel()
  await channel.assertExchange(exchange, 'topic', { durable: false })

  return {
    async publish(routingKey: string, message: Record<string, unknown>): Promise<void> {
      channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), {
        persistent: false,
      })
    },
    async close(): Promise<void> {
      // Close the channel/connection before anything that might stop the
      // broker out from under it (e.g. a testcontainers `.stop()` in the
      // integration tier) -- mirrors tower's own "close adapters before
      // stopping the container" convention (TESTING.md), same failure mode
      // otherwise: a noisy, uncaught "connection closed" exception even
      // though the test itself already passed.
      await channel.close()
      await connection.close()
    },
  }
}
