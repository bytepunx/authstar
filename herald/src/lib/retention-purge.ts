import type { ConsequentApi } from './consequent-types.js'
import type { CommunicationTypeState } from '../actors/communication_type_actor.js'
import type { CommunicationState } from '../actors/communication_actor.js'
import { communicationActorId } from './communication-id.js'

// Per design/decisions/0029-herald-payload-retention.md's "Purging is a
// scheduled sweep, not a reactive mechanism" -- "the same operational
// shape as ADR 0012's RabbitMQ-credential-rotation CronJob: a periodic
// (e.g. daily) herald-owned job finds `communication` records past their
// type's retention deadline and clears `encryptedPayload`." The
// `communication.purgePayload` command this calls already exists and is
// already exercised by the erasure path (`contact-lifecycle-consumer.ts`,
// ADR 0026) -- this is the *other*, time-based trigger ADR 0029 itself
// describes as "a second path into the same clearing operation."
//
// This is the run-once, testable core -- called by `src/purge-retention.ts`'s
// standalone CronJob entrypoint (real signet/Postgres wiring, no fastify
// server, no RabbitMQ) once per firing. Deliberately does NOT add
// `createdAt`/`payloadPurgedAt` to `communication`'s `searchableBy`
// (`communication_actor.ts`) to query "past deadline, not yet purged"
// directly: consequent's default in-memory search adapter never indexes a
// falsy value at all (confirmed directly against `searchAdapter.js`'s own
// `addToFieldIndex`: `if (value) { ... }` -- a `null` `payloadPurgedAt`
// would simply never appear in that field's index), so a query built
// around "is null" wouldn't behave the same way against the in-memory
// adapter tests run against as it might against real Postgres. Instead:
// query by `{tenant, type}` alone (both already searchable, both always
// truthy) to fetch every communication of a given type under a given
// tenant, then filter by retention deadline / already-purged / has-a-
// payload-to-purge in plain application code -- correct regardless of
// which search adapter is behind it.
export interface RetentionPurgeResult {
  typesChecked: number
  checked: number
  purged: number
  errors: Array<{ key: string, tenant: string, error: string }>
}

function isPastRetention(communication: CommunicationState, retentionDays: number, now: Date): boolean {
  if (!communication.createdAt) return false
  const deadline = new Date(communication.createdAt).getTime() + retentionDays * 24 * 60 * 60 * 1000
  return now.getTime() >= deadline
}

export async function purgeExpiredPayloads(
  consequent: ConsequentApi,
  log: (message: string) => void = () => {},
  now: Date = new Date(),
): Promise<RetentionPurgeResult> {
  const typeInstances = await consequent.find('communicationType', [{ status: 'active' }] as unknown as Record<string, unknown>)
  const types = typeInstances
    .map((i) => i.state as unknown as CommunicationTypeState)
    .filter((t) => Boolean(t.type))

  const result: RetentionPurgeResult = { typesChecked: 0, checked: 0, purged: 0, errors: [] }

  for (const communicationType of types) {
    result.typesChecked += 1
    const instances = await consequent.find(
      'communication',
      [{ tenant: communicationType.tenant, type: communicationType.type }] as unknown as Record<string, unknown>,
    )
    const communications = instances
      .map((i) => i.state as unknown as CommunicationState)
      .filter((c) => Boolean(c.createdAt))

    for (const communication of communications) {
      result.checked += 1
      if (communication.payloadPurgedAt || !communication.encryptedPayload) continue
      if (!isPastRetention(communication, communicationType.retentionDays, now)) continue

      // `communication.key` is a redundant, human-readable informational
      // field only (`"<tenant>:<idempotencyKey>"`, set once in `created`'s
      // event handler and never used as a lookup elsewhere) -- it is NOT
      // the actor's real id, which is `communicationActorId(tenant,
      // idempotencyKey)` (a hash, since the raw composite can exceed
      // consequent-postgres's `character(42)` id column -- see that
      // function's own header comment). Using `communication.key` here
      // directly was a real bug: it silently created and "purged" an
      // unrelated, never-before-used orphaned actor instance instead of
      // the real one, since a `consequent.handle()` call against an id
      // matching no existing actor is indistinguishable from a legitimate
      // first command to a brand-new one.
      const actorId = communicationActorId(communication.tenant, communication.idempotencyKey)
      try {
        const results = await consequent.handle(actorId, 'communication.purgePayload', {})
        const rejection = results.find((r) => r?.rejected)
        if (rejection) {
          result.errors.push({ key: communication.key, tenant: communication.tenant, error: rejection.reason?.message ?? 'rejected' })
          continue
        }
        result.purged += 1
        log(`purged payload for communication ${communication.key} (${communication.tenant}/${communication.type}), past its ${communicationType.retentionDays}-day retention window`)
      } catch (err) {
        result.errors.push({ key: communication.key, tenant: communication.tenant, error: (err as Error).message })
      }
    }
  }

  return result
}
