import { createHash } from 'node:crypto'

// consequent-postgres's `<type>_snapshot`/`<type>_id_map` tables store `id`
// as a fixed `character(42)` column (the exact same platform-level
// constraint tower's own TESTING.md documents hitting for contact ids and
// invite tokens) -- a raw `${tenant}:${idempotencyKey}` composite easily
// exceeds that once `idempotencyKey` is itself business-meaningful. tower's
// own invite-sent publish already uses `invite:${token}:sent` (52
// characters on its own, `token` already a 40-hex-char id), so
// `${tenant}:${idempotencyKey}` routinely lands well past 42 -- confirmed
// live: this is what turned a single invite into an infinite RabbitMQ
// redelivery loop (`consequent.handle`'s underlying INSERT throws "value
// too long for type character(42)" on every identical retry, an error
// `src/lib/comms-consumer.ts` doesn't distinguish from a transient one).
//
// A hash, not a truncation: naive `.slice(0, 40)` would let two distinct
// long `idempotencyKey`s collide once their shared prefix exceeds the
// truncation point -- SHA-1's 40-hex-char digest is both fixed-length
// (well under 42) and collision-resistant enough for this purpose (an
// idempotency key, not a security boundary).
export function communicationActorId(tenant: string, idempotencyKey: string): string {
  return createHash('sha1').update(`${tenant}:${idempotencyKey}`).digest('hex')
}
