import amqplib from 'amqplib'
import { startCommsConsumer } from './comms-consumer.js'
import type { SendWorkerDeps } from './send-worker.js'

// Real `amqplib` wiring for `comms-consumer.ts`'s channel-agnostic ingest
// logic -- the piece `comms-consumer.ts`'s own header comment says "lives
// in `src/server.ts`" and, until now, didn't exist at all. Split into its
// own module (rather than inlined in `server.ts`, the way tower's
// `entitlement`/`erasure-ack` consumers are) so it has the same
// `buildConsumer(options) -> Consumer` shape chronicle's
// `src/consumer/build-consumer.ts` established -- the closest mechanical
// template in this stack, and the shape that lets the RabbitMQ integration
// tier stand this up directly against a disposable broker without needing
// `server.ts`'s full signet/Postgres bootstrap.
//
// Routing key convention per ADR 0022: `comms.<category>.<type>` (e.g.
// `comms.transactional.invite-sent`) -- one binding over the whole
// `comms.#` space, same "herald doesn't care who published it or what the
// specific type is" reasoning chronicle's own `analytics.#` binding uses.

export interface CommsConsumerOptions {
  url: string
  deps: SendWorkerDeps
  exchange?: string
  queue?: string
}

export interface Consumer {
  close(): Promise<void>
}

const DEFAULT_EXCHANGE = 'authstar'
const DEFAULT_QUEUE = 'herald.comms'
const ROUTING_PATTERN = 'comms.#'

export default async function buildCommsConsumer(options: CommsConsumerOptions): Promise<Consumer> {
  const connection = await amqplib.connect(options.url)
  const channel = await connection.createChannel()

  const exchange = options.exchange ?? DEFAULT_EXCHANGE
  const queue = options.queue ?? DEFAULT_QUEUE

  // Durable, per ADR 0006 -- `comms.*` carries business-critical send
  // requests (a tenant's invite, a trial-expiring notice, ...), a
  // different reliability tier than e.g. chronicle's fire-and-forget
  // analytics queue (`durable: false` there is a deliberate, named
  // trade-off specific to that tier -- see chronicle's own
  // `build-consumer.ts`). Real quorum-queue topology (`x-queue-type`,
  // replication factor) is expected to be declared via the Messaging
  // Topology Operator's CRDs in git (ADR 0006's own stated consequence),
  // not hardcoded from application code -- matches tower's own
  // `assertQueue(..., { durable: true })` convention, which sets no
  // `x-queue-type` argument either.
  await channel.assertExchange(exchange, 'topic', { durable: true })
  await channel.assertQueue(queue, { durable: true })
  await channel.bindQueue(queue, exchange, ROUTING_PATTERN)

  await startCommsConsumer(channel, queue, options.deps)

  return {
    async close() {
      await channel.close()
      await connection.close()
    },
  }
}
