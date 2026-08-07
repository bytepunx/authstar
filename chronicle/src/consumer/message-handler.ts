import type { Logger } from 'pino'
import type { AnalyticsEventRow, ClickHouseApi } from '../lib/types.js'
import { mapMessageToRow, MalformedEventError } from './map-event.js'
import Batcher from './batcher.js'

// Minimal ack/nack surface this module needs from a broker channel --
// deliberately not `amqplib`'s own `Channel` type, so this logic is
// testable against a fake channel/message with no real broker involved
// (Story 001's behavior tier). `amqplib`'s real `Channel` satisfies this
// structurally, so `build-consumer.ts` can hand one straight in.
export interface ConsumerChannel<TMessage = unknown> {
  ack(message: TMessage): void
  nack(message: TMessage, allUpTo: boolean, requeue: boolean): void
}

export interface MessageHandlerOptions<TMessage = unknown> {
  clickhouse: ClickHouseApi
  channel: ConsumerChannel<TMessage>
  logger: Logger
  batchMaxSize?: number
  batchMaxWaitMs?: number
}

export interface AnalyticsMessageHandler<TMessage = unknown> {
  handle(routingKey: string, payload: Record<string, unknown>, message: TMessage): void
  flush(): Promise<void>
  close(): Promise<void>
}

interface BufferedEntry<TMessage> {
  row: AnalyticsEventRow
  message: TMessage
}

// The channel-agnostic core of Story 001's consumer: maps a message onto
// `analytics_events`'s columns, batches it, and flushes via
// `ClickHouseApi.insertEvents`. Kept separate from the real amqplib wiring
// (`build-consumer.ts`) so it's unit-testable with a fake channel and a
// fake/in-memory `ClickHouseApi`.
export default function createAnalyticsMessageHandler<TMessage = unknown>(
  options: MessageHandlerOptions<TMessage>,
): AnalyticsMessageHandler<TMessage> {
  const batcher = new Batcher<BufferedEntry<TMessage>>({
    maxSize: options.batchMaxSize ?? 250,
    maxWaitMs: options.batchMaxWaitMs ?? 5_000,
    flush: async (entries) => {
      await options.clickhouse.insertEvents(entries.map((entry) => entry.row))
      for (const entry of entries) options.channel.ack(entry.message)
    },
    onFlushError: (error, entries) => {
      options.logger.error({ error }, 'chronicle: batch insert failed, nacking batch without requeue')
      // Non-durable, loss-tolerant pipeline (ADR 0035) -- a failed batch is
      // dropped, not requeued for immediate redelivery into the same
      // failure.
      for (const entry of entries) options.channel.nack(entry.message, false, false)
    },
  })

  return {
    handle(routingKey, payload, message) {
      try {
        const row = mapMessageToRow(routingKey, payload)
        batcher.add({ row, message })
      } catch (error) {
        if (error instanceof MalformedEventError) {
          options.logger.warn({ error: error.message, routingKey }, 'chronicle: dropping malformed analytics event')
          options.channel.ack(message)
          return
        }
        throw error
      }
    },
    flush: () => batcher.flush(),
    close: () => batcher.close(),
  }
}
