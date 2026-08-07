import amqp from 'amqplib'
import type { Logger } from 'pino'
import type { ClickHouseApi } from '../lib/types.js'
import createAnalyticsMessageHandler from './message-handler.js'

export interface ConsumerOptions {
  url: string
  clickhouse: ClickHouseApi
  logger: Logger
  batchMaxSize?: number
  batchMaxWaitMs?: number
  exchange?: string
  queue?: string
}

export interface Consumer {
  close(): Promise<void>
}

const DEFAULT_EXCHANGE = 'analytics'
const DEFAULT_QUEUE = 'chronicle.analytics'
// One binding covering the whole `analytics.#` routing-key space, rather
// than a separate binding per event type -- every event lands in the same
// table regardless of type (Story 001 / ADR 0085).
const ROUTING_PATTERN = 'analytics.#'

// Real amqplib wiring: connects, asserts the non-durable exchange/queue(s)
// lookout publishes to (ADR 0035), binds the whole `analytics.#` space, and
// delegates per-message handling to the channel-agnostic
// `createAnalyticsMessageHandler`.
export default async function buildConsumer(options: ConsumerOptions): Promise<Consumer> {
  const connection = await amqp.connect(options.url)
  const channel = await connection.createChannel()

  const exchange = options.exchange ?? DEFAULT_EXCHANGE
  const queueName = options.queue ?? DEFAULT_QUEUE

  // Non-durable exchange/queue -- a different reliability tier than
  // everything else on this broker (ADR 0035): analytics loss during a
  // brief chronicle outage is an accepted trade-off, not a bug.
  await channel.assertExchange(exchange, 'topic', { durable: false })
  await channel.assertQueue(queueName, { durable: false })
  await channel.bindQueue(queueName, exchange, ROUTING_PATTERN)

  const handler = createAnalyticsMessageHandler({
    clickhouse: options.clickhouse,
    logger: options.logger,
    channel,
    batchMaxSize: options.batchMaxSize,
    batchMaxWaitMs: options.batchMaxWaitMs,
  })

  await channel.consume(queueName, (message) => {
    if (!message) return // null delivery -- consumer cancelled server-side
    const routingKey = message.fields.routingKey
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(message.content.toString('utf8'))
    } catch (error) {
      options.logger.warn({ error, routingKey }, 'chronicle: dropping unparseable analytics message')
      channel.ack(message)
      return
    }
    handler.handle(routingKey, payload, message)
  }, { noAck: false })

  return {
    async close() {
      await handler.close()
      await channel.close()
      await connection.close()
    },
  }
}
