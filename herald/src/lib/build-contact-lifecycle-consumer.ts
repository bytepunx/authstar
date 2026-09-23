import amqplib from 'amqplib'
import { startContactLifecycleConsumer, CONTACT_PURGED_ROUTING_KEY, CONTACT_MIGRATED_ROUTING_KEY } from './contact-lifecycle-consumer.js'
import type { ContactLifecycleConsumerDeps } from './contact-lifecycle-consumer.js'

// Real `amqplib` wiring for `contact-lifecycle-consumer.ts` -- the erasure
// cascade's subscriber side (ADR 0026) plus the (not-yet-produced, see that
// module's own header comment) `contact.migrated` carry-forward (ADR
// 0024/0076). Same `buildConsumer(options) -> Consumer` shape as
// `build-comms-consumer.ts`/chronicle's `build-consumer.ts`.
//
// Two fixed routing keys, not a shared wildcard prefix (`contact.purged`
// vs. `herald.contact.migrated` don't share a `contact.*` namespace the
// way `comms.*` types do) -- two explicit bindings onto the same durable
// queue rather than a broader pattern that would also catch unrelated
// `contact.*`/`herald.*` traffic.

export interface ContactLifecycleConsumerOptions {
  url: string
  deps: ContactLifecycleConsumerDeps
  exchange?: string
  queue?: string
}

export interface Consumer {
  close(): Promise<void>
}

const DEFAULT_EXCHANGE = 'authstar'
const DEFAULT_QUEUE = 'herald.contact-lifecycle'

export default async function buildContactLifecycleConsumer(options: ContactLifecycleConsumerOptions): Promise<Consumer> {
  const connection = await amqplib.connect(options.url)
  const channel = await connection.createChannel()

  const exchange = options.exchange ?? DEFAULT_EXCHANGE
  const queue = options.queue ?? DEFAULT_QUEUE

  // Durable, per ADR 0006 -- same business-event tier as `comms.*`, see
  // `build-comms-consumer.ts`'s longer note on why no `x-queue-type`
  // argument is set from application code.
  await channel.assertExchange(exchange, 'topic', { durable: true })
  await channel.assertQueue(queue, { durable: true })
  await channel.bindQueue(queue, exchange, CONTACT_PURGED_ROUTING_KEY)
  await channel.bindQueue(queue, exchange, CONTACT_MIGRATED_ROUTING_KEY)

  await startContactLifecycleConsumer(channel, queue, options.deps)

  return {
    async close() {
      await channel.close()
      await connection.close()
    },
  }
}
