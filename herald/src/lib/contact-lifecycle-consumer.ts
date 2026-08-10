import type { ConsequentApi } from './consequent-types.js'
import type { Publisher } from './publisher.js'
import type { OptOutState } from '../actors/opt_out_actor.js'
import type { SuppressionState } from '../actors/suppression_actor.js'
import type { CommunicationState } from '../actors/communication_actor.js'

// Herald's subscriber side of the erasure/lifecycle cascade -- explicitly
// out of scope in Story 001/004's own "Not Covered Here" sections (see
// TESTING.md's "What's deliberately left uncovered"), now in scope. Two
// message types, per ADR 0024 (amended by ADR 0026/0076), both published
// by tower (the `contact` table's owner):
//
// - `contact.purged` -- `{ tenant, contactId, accountId }`. Generalized by
//   ADR 0026 from the herald-specific `herald.contact.purged` (ADR 0024) to
//   a consumer-agnostic name any interested service binds its own queue
//   to. Confirmed against tower's actual source
//   (`tower/src/routes/contacts.ts`'s `DELETE .../contacts/:contactId`
//   route): routing key is literally `'contact.purged'`, payload is
//   exactly `{ tenant, contactId, accountId }` -- `accountId` was added by
//   ADR 0040 for keep's benefit, herald itself never reads it.
// - `herald.contact.migrated` -- `{ tenant, oldContactId, newContactId }`.
//   Named in ADR 0024, *not* generalized by ADR 0026 the way `purged` was
//   (that ADR's "generalize the purge signal" section only renames the
//   purge message), so the routing key keeps its original `herald.`
//   prefix. ADR 0076 (2026-08-02) is the first thing that actually
//   triggers this for the email-change case -- confirmed by reading
//   tower's source directly: no publish call for it exists anywhere in
//   `tower/src` yet (grepped for `migrated`/`oldContactId`/`newContactId`,
//   nothing found), so there is no real producer to integration-test
//   against in this pass. Built here against the ADR-documented contract
//   only -- see TESTING.md for the explicit scope note.
//
// Same minimal `ChannelLike` structural-fake convention as
// `comms-consumer.ts`/tower's `entitlement-consumer.ts`: behavior/e2e tests
// drive this against a fake channel with no broker running; the real
// `amqplib` queue/exchange/binding wiring lives in
// `build-contact-lifecycle-consumer.ts` and is exercised for real only by
// the RabbitMQ integration tier.

export interface ConsumedMessage {
  content: Buffer
  fields: { routingKey: string }
}

export interface ChannelLike {
  consume(queue: string, onMessage: (msg: ConsumedMessage | null) => void): Promise<unknown>
  ack(msg: ConsumedMessage): void
  nack(msg: ConsumedMessage, allUpTo: boolean, requeue: boolean): void
}

export interface ContactLifecycleConsumerDeps {
  consequent: ConsequentApi
  publisher: Publisher
}

export const CONTACT_PURGED_ROUTING_KEY = 'contact.purged'
export const CONTACT_MIGRATED_ROUTING_KEY = 'herald.contact.migrated'

interface PurgedEnvelope {
  tenant: string
  contactId: string
  accountId?: string | null
  [key: string]: unknown
}

interface MigratedEnvelope {
  tenant: string
  oldContactId: string
  newContactId: string
  [key: string]: unknown
}

function isPurgedEnvelope(payload: Record<string, unknown>): payload is PurgedEnvelope {
  return typeof payload.tenant === 'string' && typeof payload.contactId === 'string'
}

function isMigratedEnvelope(payload: Record<string, unknown>): payload is MigratedEnvelope {
  return typeof payload.tenant === 'string' && typeof payload.oldContactId === 'string' && typeof payload.newContactId === 'string'
}

// Deletes herald's `optOut` record for `contactId` outright (ADR 0024:
// "migration doesn't apply here, since there's no new identity for the
// preference to carry forward to"). `optOut` has no dedicated
// delete/reset command (unlike `suppression`, which does -- see
// `suppression_actor.ts`'s `remove`), and adding one would be a change to
// an already-tested actor for a single caller's benefit -- instead this
// walks the existing, idempotent `removeCategory` command over every
// category currently on record, which converges the projected state to
// the same "nothing opted out" shape `remove` would produce, using
// exactly the vocabulary the actor already exposes. Safe to redeliver:
// once every category is gone, a second pass is a no-op loop over an
// empty array.
async function purgeOptOut(consequent: ConsequentApi, contactId: string): Promise<void> {
  const instance = await consequent.fetch('optOut', contactId)
  const state = instance?.state as unknown as OptOutState | undefined
  if (!state?.tenant) return // never had an opt-out record -- nothing to purge
  for (const category of state.optedOutCategories) {
    await consequent.handle(contactId, 'optOut.removeCategory', { category })
  }
}

// Strips `encryptedPayload` on every `communication` record for this
// `contactId` (ADR 0026's close of the herald gap ADR 0025 opened) -- the
// minimal audit fields (status, timestamps, hashed `contactId`) stay, only
// the ciphertext goes, via the existing `communication.purgePayload`
// command (already implemented, already unit-tested against the actor
// directly -- this is the first thing that actually calls it from a
// RabbitMQ delivery). `find()` wrapped in a single-element criteria array
// -- see `template-lookup.ts#templatesFor`'s canonical note for why
// `consequent-postgres`'s real search adapter needs that shape despite the
// published (looser) type; the historical `find()`-against-Postgres bug
// that note also describes is fixed upstream as of this pilot's pinned
// versions (see `spec/integration/herald.integration.spec.ts`'s own
// updated header), so this is no longer a "correct but currently
// non-functional in production" code path the way it briefly was.
async function purgeCommunicationPayloads(consequent: ConsequentApi, tenant: string, contactId: string): Promise<void> {
  const criteria = [{ tenant, contactId }] as unknown as Record<string, unknown>
  const instances = await consequent.find('communication', criteria)
  for (const instance of instances) {
    const state = instance.state as unknown as CommunicationState
    if (state.payloadPurgedAt) continue // already purged -- idempotent redelivery, not an error
    const results = await consequent.handle(state.key, 'communication.purgePayload', {})
    const rejection = results.find((r) => r?.rejected)
    if (rejection) continue // lost a race with another redelivery purging the same record -- fine
  }
}

export async function handleContactPurged(deps: ContactLifecycleConsumerDeps, payload: PurgedEnvelope): Promise<void> {
  await purgeOptOut(deps.consequent, payload.contactId)
  await purgeCommunicationPayloads(deps.consequent, payload.tenant, payload.contactId)
  // ADR 0026: "Each subscribing service publishes `contact.purge.acknowledged`
  // (`{ tenant, contactId, service }`) once it has finished purging its own
  // copy" -- tower's own `erasureRequest` actor (`erasure-ack-consumer.ts`)
  // is the consumer on the other end of this. Published last, after both
  // purge steps above have actually completed -- an ack published before
  // the work is done would be a false compliance signal.
  await deps.publisher.publish('contact.purge.acknowledged', {
    tenant: payload.tenant,
    contactId: payload.contactId,
    service: 'herald',
  })
}

// Carries forward `optOut` categories from `oldContactId` to
// `newContactId` (ADR 0024) using the same idempotent `addCategory`
// command the self-service unsubscribe flow already uses -- redelivery-safe
// by construction (adding an already-present category is a documented
// no-op, see `opt_out_actor.ts`).
async function migrateOptOut(consequent: ConsequentApi, tenant: string, oldContactId: string, newContactId: string): Promise<void> {
  const instance = await consequent.fetch('optOut', oldContactId)
  const state = instance?.state as unknown as OptOutState | undefined
  if (!state?.tenant) return // nothing opted out at the old identity -- nothing to carry forward
  for (const category of state.optedOutCategories) {
    await consequent.handle(newContactId, 'optOut.addCategory', { tenant, contactId: newContactId, category })
  }
}

// Carries forward a `suppression` record the same way (ADR 0076 extends
// ADR 0024's migration handling to cover this, since `suppression` -- ADR
// 0074 -- didn't exist when ADR 0024 was written). `suppression.create`
// rejects (not throws, per this codebase's "reject via a rejected promise"
// convention -- see TESTING.md gotcha #2) if a suppression already exists
// at `newContactId`; that's a safe, expected outcome on redelivery, not an
// error to propagate.
async function migrateSuppression(consequent: ConsequentApi, tenant: string, oldContactId: string, newContactId: string): Promise<void> {
  const instance = await consequent.fetch('suppression', oldContactId)
  const state = instance?.state as unknown as SuppressionState | undefined
  if (!state?.createdAt) return // old identity was never suppressed -- nothing to carry forward
  const results = await consequent.handle(newContactId, 'suppression.create', { tenant, contactId: newContactId, reason: state.reason })
  const rejection = results.find((r) => r?.rejected)
  if (rejection) return // already migrated by an earlier redelivery -- fine
}

export async function handleContactMigrated(deps: ContactLifecycleConsumerDeps, payload: MigratedEnvelope): Promise<void> {
  await migrateOptOut(deps.consequent, payload.tenant, payload.oldContactId, payload.newContactId)
  await migrateSuppression(deps.consequent, payload.tenant, payload.oldContactId, payload.newContactId)
}

export async function startContactLifecycleConsumer(channel: ChannelLike, queue: string, deps: ContactLifecycleConsumerDeps): Promise<void> {
  await channel.consume(queue, (msg) => {
    if (!msg) return

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(msg.content.toString('utf8')) as Record<string, unknown>
    } catch {
      channel.nack(msg, false, false) // malformed -- dead-letter, don't requeue forever
      return
    }

    const routingKey = msg.fields.routingKey
    let outcome: Promise<void>
    if (routingKey === CONTACT_PURGED_ROUTING_KEY && isPurgedEnvelope(payload)) {
      outcome = handleContactPurged(deps, payload)
    } else if (routingKey === CONTACT_MIGRATED_ROUTING_KEY && isMigratedEnvelope(payload)) {
      outcome = handleContactMigrated(deps, payload)
    } else {
      // Unrecognized routing key, or a recognized one with a malformed
      // payload (missing required fields) -- dead-letter rather than
      // requeue-forever, same reasoning as a JSON parse failure.
      channel.nack(msg, false, false)
      return
    }

    outcome
      .then(() => channel.ack(msg))
      .catch(() => channel.nack(msg, false, true)) // transient failure -- requeue for redelivery
  })
}
