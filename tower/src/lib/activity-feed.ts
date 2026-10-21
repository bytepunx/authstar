import type { FastifyInstance } from 'fastify'
import { searchCriteria, type ConsequentEvent } from './consequent-types.js'

// Per design/stories/tower/010-activity-feed.md and design/adrs/
// 0060-activity-feed-and-revenue-summary.md. Shared by both the
// tenant-scoped (`routes/activity.ts`'s `GET /tenants/{tenantSlug}/
// activity`) and operator-scoped (`GET /operator/tenants/{tenantSlug}/
// activity`) routes -- same handler, different auth middleware, per the
// story's own "reused, not a separate implementation" requirement.

export interface ActivityEntry {
  timestamp: string
  actorType: string
  actorId: string
  eventType: string
  summary: string
  actingAs: string | null
}

const ACTIVITY_ACTOR_TYPES = ['application', 'provider', 'account', 'roleDefinition', 'invite', 'inviteCode'] as const
type ActivityActorType = typeof ACTIVITY_ACTOR_TYPES[number]

// The story's own checklist frames application/provider ids as "free --
// already sitting in tenant.applications/tenant.providers, no query
// needed." True for the *business* key, but `getEventStream` needs each
// actor's internal system id (`state._id`), not its business key --
// confirmed directly against `consequent`'s real behavior while fixing
// `getEventStream`/`getActorStream` upstream (see that package's own
// CHANGELOG/git history): both functions key events by the flake-
// generated `_id` `events.ts` actually stores under, not the
// `identifiedBy` field. Resolving the embedded arrays' slugs/names to
// system ids would still cost one fetch per entry, so `find()` (which
// already returns full state, `_id` included, in one round trip) is used
// uniformly for all six types instead -- fewer round trips than "embedded
// array + N individual fetches," not a deviation from the story's actual
// goal (discover this tenant's relevant actor ids per type).
async function discoverActorSystemIds(app: FastifyInstance, tenantSlug: string): Promise<Partial<Record<ActivityActorType, string[]>>> {
  const results = await Promise.all(
    ACTIVITY_ACTOR_TYPES.map((type) => app.consequent.find(type, searchCriteria({ tenant: tenantSlug }))),
  )
  const byType: Partial<Record<ActivityActorType, string[]>> = {}
  ACTIVITY_ACTOR_TYPES.forEach((type, i) => {
    const ids = results[i]
      .map((instance) => (instance.state as Record<string, unknown>)._id)
      .filter((id): id is string => typeof id === 'string')
    if (ids.length > 0) byType[type] = ids
  })
  return byType
}

function scopeLabel(scope: unknown): string {
  if (scope === 'tenant') return 'tenant-wide'
  if (scope && typeof scope === 'object' && 'application' in scope) {
    return `for application '${(scope as { application: string }).application}'`
  }
  return ''
}

// Keyed by `eventType`, not a generic dump of the event's raw fields --
// per the story's own instruction. Each formatter receives the raw event
// (already carrying whatever fields that actor's own command handler put
// on it, per `src/actors/*.ts`).
const SUMMARY_FORMATTERS: Partial<Record<string, (event: Record<string, unknown>) => string>> = {
  'application.created': (e) => `Application '${e.name as string}' created`,
  'application.updated': () => 'Application updated',
  'application.suspended': () => 'Application suspended',
  'application.deleted': () => 'Application deleted',

  'provider.created': (e) => `Provider '${e.name as string}' added`,

  'account.created': () => 'Account created',
  'account.role-granted': (e) => {
    const role = e.role as { name: string, scope: unknown }
    return `Role '${role.name}' granted (${scopeLabel(role.scope)})`
  },
  'account.role-revoked': (e) => {
    const role = e.role as { name: string, scope: unknown }
    return `Role '${role.name}' revoked (${scopeLabel(role.scope)})`
  },
  'account.trial-role-granted': (e) => {
    const role = e.role as { name: string, scope: unknown }
    return `Trial role '${role.name}' granted (${scopeLabel(role.scope)})`
  },
  'account.permission-granted': (e) => {
    const permission = e.permission as { grant: string, scope: unknown }
    return `Permission '${permission.grant}' granted (${scopeLabel(permission.scope)})`
  },
  'account.permission-revoked': (e) => {
    const permission = e.permission as { grant: string, scope: unknown }
    return `Permission '${permission.grant}' revoked (${scopeLabel(permission.scope)})`
  },
  'account.usage-updated': (e) => `Usage updated for '${e.application as string}'`,
  'account.contact-changed': () => 'Contact changed',
  'account.suspended': () => 'Account suspended',
  'account.activated': () => 'Account activated',
  'account.deleted': () => 'Account deleted',

  'roleDefinition.created': (e) => `Role definition '${e.name as string}' created (${scopeLabel(e.scope)})`,
  'roleDefinition.updated': () => 'Role definition updated',
  'roleDefinition.retired': () => 'Role definition retired',

  'invite.created': () => 'Invite sent',
  'invite.accepted': () => 'Invite accepted',
  'invite.revoked': () => 'Invite revoked',

  'inviteCode.created': (e) => `Invite code '${e.code as string}' created`,
  'inviteCode.redeemed': () => 'Invite code redeemed',
  'inviteCode.revoked': () => 'Invite code revoked',
}

function summarize(event: ConsequentEvent): string {
  const formatter = SUMMARY_FORMATTERS[event.type as string]
  return formatter ? formatter(event as Record<string, unknown>) : (event.type as string)
}

function toEntry(event: ConsequentEvent): ActivityEntry {
  return {
    timestamp: event._createdOn ?? '',
    actorType: event._actorType ?? '',
    actorId: event._actorId ?? '',
    eventType: event.type ?? '',
    summary: summarize(event),
    actingAs: typeof (event as Record<string, unknown>).actingAs === 'string' ? (event as Record<string, unknown>).actingAs as string : null,
  }
}

export interface ActivityPage {
  data: ActivityEntry[]
  nextCursor: string | null
}

export const DEFAULT_ACTIVITY_LIMIT = 50

// `getEventStream` has no server-side page-size/limit concept of its own
// (`options`: `since`/`sinceId`/`until`/`untilId`/`eventTypes`/`filter` --
// no `limit`) -- it always returns the full bounded stream. Pagination is
// therefore done here, in memory, over that already-sorted (ascending by
// event id) result: reversed to newest-first for feed display, sliced by
// cursor. Fine for this pilot's scope; a tenant with a genuinely enormous
// combined event history across all six actor types would need
// `getEventStream` to grow real server-side limiting first.
export async function buildActivityFeed(app: FastifyInstance, tenantSlug: string, options: { limit?: number, cursor?: string } = {}): Promise<ActivityPage> {
  const limit = options.limit && options.limit > 0 ? options.limit : DEFAULT_ACTIVITY_LIMIT
  const actorsByType = await discoverActorSystemIds(app, tenantSlug)

  if (Object.keys(actorsByType).length === 0) {
    return { data: [], nextCursor: null }
  }

  const stream = await app.consequent.getEventStream('', { actors: actorsByType as Record<string, unknown> })
  const events = [...stream] as ConsequentEvent[]
  events.reverse() // newest first

  const startIndex = options.cursor
    ? events.findIndex((e) => e.id === options.cursor) + 1
    : 0
  const page = events.slice(startIndex, startIndex + limit)
  const hasMore = startIndex + limit < events.length
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null

  return {
    data: page.map(toEntry),
    nextCursor: nextCursor ?? null,
  }
}
