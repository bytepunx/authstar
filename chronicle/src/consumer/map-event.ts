import { randomUUID } from 'node:crypto'
import { isRecognizedEventType } from '../lib/types.js'
import type { AnalyticsEventRow } from '../lib/types.js'

export class MalformedEventError extends Error {}

// The `analytics.` prefix on the routing key is never stored -- ADR 0085's
// DDL comment shows bare `'auth.login-succeeded'`/`'request'`/
// `'client.<type>'` as the actual `eventType` values.
function deriveEventType(routingKey: string): string {
  return routingKey.startsWith('analytics.') ? routingKey.slice('analytics.'.length) : routingKey
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Maps one RabbitMQ message directly onto `analytics_events`'s columns
// (Story 001, ADR 0085). Fields that don't apply to this event's type are
// left `null`, never zero-valued/empty-string -- a `null` `reason` on a
// `login-succeeded` event is correct, not missing data.
//
// Throws `MalformedEventError` for a message missing a required
// always-present field (`tenant`/`application`/`timestamp`), or an
// `eventType` chronicle doesn't recognize -- the caller logs and drops it,
// never retries, never lets one bad event block the rest of the batch.
export function mapMessageToRow(routingKey: string, payload: Record<string, unknown>): AnalyticsEventRow {
  const eventType = deriveEventType(routingKey)
  const tenant = str(payload.tenant)
  const application = str(payload.application)
  const timestamp = str(payload.timestamp)

  if (!tenant || !application || !timestamp) {
    throw new MalformedEventError(
      `missing a required always-present field (tenant/application/timestamp) on routing key "${routingKey}"`,
    )
  }
  if (!isRecognizedEventType(eventType)) {
    throw new MalformedEventError(`unrecognized eventType "${eventType}" on routing key "${routingKey}"`)
  }

  const isAuthEvent = eventType.startsWith('auth.')
  const isRequestEvent = eventType === 'request'
  const isClientEvent = eventType.startsWith('client.')

  return {
    tenant,
    application,
    eventType,
    timestamp,
    identityHash: str(payload.identityHash),

    idp: isAuthEvent ? str(payload.idp) : null,
    reason: isAuthEvent ? str(payload.reason) : null,

    method: isRequestEvent ? str(payload.method) : null,
    path: isRequestEvent ? str(payload.path) : null,
    status: isRequestEvent ? num(payload.status) : null,
    latencyMs: isRequestEvent ? num(payload.latencyMs) : null,

    // The raw JSON body -- lookout's allowlist defines the shape per
    // client event type, not this schema (ADR 0085).
    clientPayload: isClientEvent ? JSON.stringify(payload) : null,

    // Assigned at ingestion by lookout; generated here only as a defensive
    // fallback for a message that somehow arrives without one -- `eventId`
    // is a non-nullable column but isn't in Story 001's "always-present"
    // required-field list, so a missing one shouldn't drop the event.
    eventId: str(payload.eventId) ?? randomUUID(),
  }
}
