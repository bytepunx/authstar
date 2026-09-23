import { processCommunication, type SendWorkerDeps } from './send-worker.js'
import { communicationActorId } from './communication-id.js'

// Per design/stories/herald/002-send-worker-and-retry.md.

export interface IngestMessage {
  idempotencyKey: string
  tenant: string
  application: string
  contactId: string
  category: 'transactional' | 'marketing'
  type: string
  title: string
  templateVersion: number
  encryptedPayload: string // serialized envelope, already encrypted by the publisher with herald's current public key
  payloadKeyVersion: number
  channel: string
  // consequent's own `Message` type has an index signature -- carried here
  // so an `IngestMessage` can be passed straight to `consequent.handle`
  // without a cast.
  [key: string]: unknown
}

// Durable creation is what a RabbitMQ delivery gets acked on (Story 002) --
// once the `communication` actor exists, retry/delivery logic lives
// entirely in herald's own state from that point forward. Idempotent: a
// redelivered message with the same `idempotencyKey` is a safe no-op (the
// `create` command rejects, we just move on), never a duplicate send.
export async function ingestCommunication(deps: SendWorkerDeps, message: IngestMessage): Promise<void> {
  const key = communicationActorId(message.tenant, message.idempotencyKey)
  const existing = await deps.consequent.fetch('communication', key)
  const existingState = existing?.state as { createdAt?: string } | undefined

  if (!existingState?.createdAt) {
    const results = await deps.consequent.handle(key, 'communication.create', message)
    const rejection = results.find((r) => r?.rejected)
    if (rejection) {
      // Lost a race with another redelivery of the same message -- already
      // created by the time we got here, which is fine, not an error.
      return
    }
  }

  await processCommunication(deps, message.tenant, message.idempotencyKey)
}
