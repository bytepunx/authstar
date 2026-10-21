import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { SubscriptionState } from '../actors/subscription_actor.js'
import type { PlanMappingState } from '../actors/plan_mapping_actor.js'
import { scopesEqual } from '../lib/scope.js'

// Story keep/006 and ADR 0071: the self-service `/me/*` family. No tenant or
// account in the URL -- both come from the forwarded internal JWT, which
// portcullis minted for this session and whose tenant hint picked the key
// that verified it. Reached only through portcullis's gated
// `/_authstar/me/subscription` forward, never by a browser directly.

export interface MeSubscriptionResponse {
  status: SubscriptionState['status'] | null
  planName: string | null
  currentPeriodEnd: string | null
}

const NONE: MeSubscriptionResponse = { status: null, planName: null, currentPeriodEnd: null }

// Statuses under which a subscription no longer entitles anything; a live
// subscription for the same account wins over one of these.
const ENDED = new Set(['canceled', 'incomplete_expired'])

/** Picks the subscription the widget should describe: a live one first, else the newest. */
export function pickSubscription(subscriptions: SubscriptionState[]): SubscriptionState | undefined {
  const byNewest = [...subscriptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return byNewest.find((s) => !ENDED.has(s.status)) ?? byNewest[0]
}

const meRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.get('/me/subscription', async (request, reply) => {
    const claims = request.authstar
    // Same one-generic-403 posture as requirePermission: no token, a
    // degraded token, and a token with no account yet are all "not you".
    if (!claims || claims.enrichmentStatus !== 'ok' || !claims.accountId) {
      return reply.code(403).send({ error: 'forbidden' })
    }
    const scope = { account: claims.accountId }
    const instances = await app.consequent.find('subscription', searchCriteria({ tenant: claims.tenant }))
    const own = instances
      .map((i) => i.state as unknown as SubscriptionState)
      .filter((s) => s.createdAt && scopesEqual(s.scope, scope))
    const subscription = pickSubscription(own)
    if (!subscription) return NONE

    const mappings = await app.consequent.find('planMapping', searchCriteria({ tenant: claims.tenant, stripePriceId: subscription.stripePriceId }))
    const mapping = mappings.map((i) => i.state as unknown as PlanMappingState)[0]
    const response: MeSubscriptionResponse = {
      status: subscription.status,
      planName: mapping?.name ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd,
    }
    return response
  })
}

export default meRoutes
