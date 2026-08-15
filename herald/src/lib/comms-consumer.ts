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
  fields: { redelivered: boolean }
}

export interface ChannelLike {
  consume(queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown>
  ack(msg: ConsumedMessage): void
  nack(msg: ConsumedMessage, allUpTo: boolean, requeue: boolean): void
}

// `log` defaults to `console.error`, not a no-op: a swallowed error here is
// exactly the real incident this function guards against (see below) --
// silence should never be the default for "a comms message failed to
// process."
export async function startCommsConsumer(
  channel: ChannelLike,
  queue: string,
  deps: SendWorkerDeps,
  log: (message: string) => void = (message) => console.error(message),
): Promise<void> {
  await channel.consume(queue, (msg) => {
    if (!msg) return

    let payload: IngestMessage
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as IngestMessage
    } catch (err) {
      // Malformed message -- unambiguously permanent (the same bytes will
      // never parse differently on redelivery) -- dead-letter, don't
      // requeue forever.
      log(`comms-consumer: malformed message body, dead-lettering: ${(err as Error).message}`)
      channel.nack(msg, false, false)
      return
    }

    ingestCommunication(deps, payload)
      .then(() => channel.ack(msg))
      .catch((err) => {
        // A rejected `create` (duplicate) never reaches here --
        // `ingestCommunication` treats that as a normal, already-handled
        // outcome, not a thrown error. What *does* reach here can be
        // either transient (a momentary store failure) or permanent (e.g.
        // a malformed payload the create command rejects for a schema
        // reason a redelivery can never fix) -- this function has no
        // reliable way to tell the two apart from an arbitrary caught
        // `Error`, so it bounds the damage instead of trying to classify
        // it: requeue for exactly one redelivery attempt
        // (`msg.fields.redelivered`, standard AMQP, no extra
        // infrastructure needed), then dead-letter rather than loop.
        //
        // This is what the real incident needed: `communication.create`'s
        // underlying Postgres INSERT failed identically on every single
        // redelivery (a composite actor id exceeding `consequent-
        // postgres`'s `character(42)` id column, since fixed -- see
        // `communication-id.ts`), and the previous unconditional
        // `nack(msg, false, true)` here requeued it at 1,000+ messages/
        // second indefinitely, with the actual error never even logged
        // (a bare `.catch(() => {...})`) -- invisible and unbounded at
        // the same time.
        const description = `comms-consumer: ingestCommunication failed for tenant=${payload.tenant} idempotencyKey=${payload.idempotencyKey}: ${(err as Error).message}`
        if (msg.fields.redelivered) {
          log(`${description} (already redelivered once -- dead-lettering instead of requeuing again)`)
          channel.nack(msg, false, false)
        } else {
          log(`${description} (requeuing for one redelivery attempt)`)
          channel.nack(msg, false, true)
        }
      })
  })
}
