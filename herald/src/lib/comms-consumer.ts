import { ingestCommunication, type IngestMessage } from './ingest.js'
import type { SendWorkerDeps } from './send-worker.js'

// Per design/stories/herald/002-send-worker-and-retry.md ("Consumes
// `comms.*` messages from RabbitMQ"). This module deliberately depends on
// a minimal structural interface, not `amqplib`'s own `Channel` type --
// lets the behavior/e2e tiers exercise real consume/ack/nack sequencing
// against a fake channel with no broker running (per this task's scope:
// "you don't need a real broker... test the worker logic... behind a fake
// channel/interface"). The real `amqplib`/`amqp-connection-manager` wiring
// (connecting to RabbitMQ, `comms.*` routing key binding) lives in
// `src/server.ts` and is intentionally not exercised by any test in this
// slice -- see TESTING.md.

export interface ConsumedMessage {
  content: Buffer
}

export interface ChannelLike {
  consume(queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown>
  ack(msg: ConsumedMessage): void
  nack(msg: ConsumedMessage, allUpTo: boolean, requeue: boolean): void
}

export async function startCommsConsumer(channel: ChannelLike, queue: string, deps: SendWorkerDeps): Promise<void> {
  await channel.consume(queue, (msg) => {
    if (!msg) return

    let payload: IngestMessage
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as IngestMessage
    } catch {
      // Malformed message -- dead-letter, don't requeue forever.
      channel.nack(msg, false, false)
      return
    }

    ingestCommunication(deps, payload)
      .then(() => channel.ack(msg))
      .catch(() => {
        // Transient infra error (e.g. a momentary store failure) -- requeue
        // for redelivery. A rejected `create` (duplicate) never reaches
        // here; `ingestCommunication` treats that as a normal, already-
        // handled outcome, not a thrown error.
        channel.nack(msg, false, true)
      })
  })
}
