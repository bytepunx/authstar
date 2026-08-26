import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { StripeWebhookEvent, StripeClient } from '../lib/stripe-client.js'
import type { CustomerState } from '../actors/customer_actor.js'
import type { PlanMappingState, GrantedRole } from '../actors/plan_mapping_actor.js'
import type { SubscriptionState } from '../actors/subscription_actor.js'
import type { TrialState } from '../actors/trial_actor.js'
import generateId from '../lib/ids.js'
import { scopesEqual, isValidScope, type Scope } from '../lib/scope.js'

// Per design/stories/keep/002-stripe-webhook-handling.md.
//
// Assumption this pilot slice makes explicit (not fully specified by the
// story): the real deployment reaches this route only via portcullis's
// `_authstar` reserved-path proxy, which already resolved the tenant from
// `Host` before forwarding -- the story says so but doesn't name the exact
// header portcullis forwards it as. This pilot assumes
// `x-authstar-tenant-slug`, documented here so a future portcullis-facing
// story can confirm or correct it (see TESTING.md).

const tenantHeaderSchema = {
  type: 'object',
  required: ['x-authstar-tenant-slug', 'stripe-signature'],
  properties: {
    'x-authstar-tenant-slug': { type: 'string', minLength: 1 },
    'stripe-signature': { type: 'string', minLength: 1 },
  },
} as const

interface StripeSubscriptionObject {
  id: string
  customer: string
  status: string
  current_period_end: number
  items: { data: Array<{ price: { id: string } }> }
  metadata?: { scope?: string }
}

interface StripeCheckoutSessionObject {
  id: string
  customer: string
  subscription: string
  metadata?: { scope?: string }
}

interface StripeChargeObject {
  id: string
  customer: string
  refunds?: { data: Array<{ id: string, amount: number, currency: string, reason: string | null, created: number }> }
  metadata?: { scope?: string }
}

interface StripeDisputeObject {
  id: string
  charge: string
  amount: number
  currency: string
  reason: string
  status: string
  metadata?: { scope?: string }
}

interface StripeInvoiceObject {
  subscription: string
  customer: string
  attempt_count?: number
}

function readScope(metadata: { scope?: string } | undefined, fallback: Scope): Scope {
  if (!metadata?.scope) return fallback
  try {
    const parsed = JSON.parse(metadata.scope)
    return isValidScope(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

async function findCustomerByStripeId(app: FastifyInstance, tenant: string, stripeCustomerId: string): Promise<CustomerState | undefined> {
  const instances = await app.consequent.find('customer', searchCriteria({ tenant, stripeCustomerId }))
  return instances.map((i) => i.state as unknown as CustomerState)[0]
}

async function findOrCreateCustomer(app: FastifyInstance, tenant: string, scope: Scope, stripeCustomerId: string): Promise<CustomerState> {
  const existing = await findCustomerByStripeId(app, tenant, stripeCustomerId)
  if (existing) return existing
  const id = generateId()
  await app.consequent.handle(id, 'customer.create', { id, tenant, scope, stripeCustomerId })
  const instance = await app.consequent.fetch('customer', id)
  return instance!.state as unknown as CustomerState
}

async function findPlanMappingByPriceId(app: FastifyInstance, tenant: string, stripePriceId: string): Promise<PlanMappingState | undefined> {
  // Keep's own webhook lookup must still resolve a *retired* mapping by
  // `stripePriceId` -- an existing subscriber's renewal event still needs
  // to look up what plan they're on (Story 003) -- so this deliberately
  // does not filter by status the way the admin-facing list route does.
  const instances = await app.consequent.find('planMapping', searchCriteria({ tenant, stripePriceId }))
  return instances.map((i) => i.state as unknown as PlanMappingState)[0]
}

async function findSubscription(app: FastifyInstance, stripeSubscriptionId: string): Promise<SubscriptionState | undefined> {
  const instance = await app.consequent.fetch('subscription', stripeSubscriptionId)
  const state = instance!.state as unknown as SubscriptionState
  return state.createdAt ? state : undefined
}

async function findActiveTrial(app: FastifyInstance, tenant: string, scope: Scope): Promise<TrialState | undefined> {
  const instances = await app.consequent.find('trial', searchCriteria({ tenant, status: 'active' }))
  const trials = instances.map((i) => i.state as unknown as TrialState)
  return trials.find((t) => scopesEqual(t.scope, scope))
}

async function findSubscriptionByScope(app: FastifyInstance, tenant: string, scope: Scope): Promise<SubscriptionState | undefined> {
  const instances = await app.consequent.find('subscription', searchCriteria({ tenant }))
  const subscriptions = instances.map((i) => i.state as unknown as SubscriptionState)
  return subscriptions.find((s) => scopesEqual(s.scope, scope))
}

function roleKey(role: GrantedRole): string {
  return `${role.application}:${role.role}`
}

function diffRoles(previous: GrantedRole[], next: GrantedRole[]): { granted: GrantedRole[], revoked: GrantedRole[] } {
  const previousKeys = new Set(previous.map(roleKey))
  const nextKeys = new Set(next.map(roleKey))
  return {
    granted: next.filter((r) => !previousKeys.has(roleKey(r))),
    revoked: previous.filter((r) => !nextKeys.has(roleKey(r))),
  }
}

function isEntitlementScope(scope: Scope): scope is { account: string } | { tenant: string } {
  return 'account' in scope || 'tenant' in scope
}

// ADR 0098: resolves any `Scope` into the concrete `{account}|{tenant}`
// scope(s) that should actually receive entitlement events -- `{account}`/
// `{tenant}` pass through unchanged; `{organization}` resolves to one
// `{account: managerId}` per the organization's current managers
// (`app.organizationManagers`, kept current by
// `organization-reference-consumer.ts`). This is where organization
// semantics get resolved into concrete accounts *before* any entitlement
// event is constructed -- `EntitlementScope`/tower's own
// `entitlement-consumer.ts` stay `{account}|{tenant}`-only and never need
// to know organizations exist at all. An organization with zero managers
// (or one keep's cache hasn't heard about yet -- see ADR 0098's accepted
// backfill limitation) simply resolves to no targets; nothing rejects.
async function resolveEntitlementTargets(app: FastifyInstance, scope: Scope): Promise<Array<{ account: string } | { tenant: string }>> {
  if (isEntitlementScope(scope)) return [scope]
  return app.organizationManagers.get(scope.organization).map((accountId) => ({ account: accountId }))
}

async function publishRoleEvents(app: FastifyInstance, tenant: string, scope: Scope, roles: GrantedRole[], eventType: 'entitlement.role-granted' | 'entitlement.role-revoked') {
  const targets = await resolveEntitlementTargets(app, scope)
  for (const target of targets) {
    for (const role of roles) {
      const sequence = await app.sequences.next(tenant, target)
      await app.entitlements.publish({
        type: eventType,
        tenant,
        scope: target,
        sequence,
        role: { name: role.role, scope: role.application },
      })
    }
  }
}

async function publishSeatLimitIfSet(app: FastifyInstance, tenant: string, scope: Scope, seatLimit: number | null) {
  if (seatLimit === null || !('tenant' in scope)) return
  const sequence = await app.sequences.next(tenant, scope)
  await app.entitlements.publish({
    type: 'entitlement.seat-limit-changed',
    tenant,
    scope: { tenant: scope.tenant },
    sequence,
    seatLimit,
  })
}

// Shared by `checkout.session.completed`/`customer.subscription.created`
// and, indirectly, subscription renewal -- creates/updates the `customer`
// and `subscription` records, converts an in-progress trial if one exists,
// and publishes the informational `converted-to-paid` event plus one
// `role-granted` per role the matching plan mapping lists (Story 002:
// "one per role... not one event carrying an array").
async function onSubscriptionActivated(app: FastifyInstance, tenant: string, sub: StripeSubscriptionObject) {
  const scope = readScope(sub.metadata, { tenant })
  const customer = await findOrCreateCustomer(app, tenant, scope, sub.customer)
  const stripePriceId = sub.items.data[0]?.price.id ?? ''
  const mapping = await findPlanMappingByPriceId(app, tenant, stripePriceId)

  const alreadyExists = await findSubscription(app, sub.id)
  if (!alreadyExists) {
    await app.consequent.handle(sub.id, 'subscription.create', {
      stripeSubscriptionId: sub.id,
      tenant,
      scope: customer.scope,
      stripePriceId,
      status: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
    })
  }

  const trial = await findActiveTrial(app, tenant, scope)
  if (trial) {
    await app.consequent.handle(trial.id, 'trial.convert', {})
  }

  for (const target of await resolveEntitlementTargets(app, scope)) {
    const sequence = await app.sequences.next(tenant, target)
    await app.entitlements.publish({ type: 'entitlement.converted-to-paid', tenant, scope: target, sequence })
  }

  if (mapping) {
    await publishRoleEvents(app, tenant, scope, mapping.grantedRoles, 'entitlement.role-granted')
    await publishSeatLimitIfSet(app, tenant, scope, mapping.seatLimit)
  }
}

async function onSubscriptionUpdated(app: FastifyInstance, tenant: string, sub: StripeSubscriptionObject) {
  const existing = await findSubscription(app, sub.id)
  const scope = existing?.scope ?? readScope(sub.metadata, { tenant })
  const previousPriceId = existing?.stripePriceId
  const newPriceId = sub.items.data[0]?.price.id ?? ''

  await app.consequent.handle(sub.id, 'subscription.update', {
    status: sub.status,
    stripePriceId: newPriceId,
    currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
  })

  if (previousPriceId && previousPriceId !== newPriceId) {
    const [previousMapping, newMapping] = await Promise.all([
      findPlanMappingByPriceId(app, tenant, previousPriceId),
      findPlanMappingByPriceId(app, tenant, newPriceId),
    ])
    const diff = diffRoles(previousMapping?.grantedRoles ?? [], newMapping?.grantedRoles ?? [])
    await publishRoleEvents(app, tenant, scope, diff.granted, 'entitlement.role-granted')
    await publishRoleEvents(app, tenant, scope, diff.revoked, 'entitlement.role-revoked')
    if (newMapping) await publishSeatLimitIfSet(app, tenant, scope, newMapping.seatLimit)
  }
}

async function onSubscriptionDeleted(app: FastifyInstance, tenant: string, sub: StripeSubscriptionObject) {
  const existing = await findSubscription(app, sub.id)
  const scope = existing?.scope ?? readScope(sub.metadata, { tenant })

  await app.consequent.handle(sub.id, 'subscription.update', { status: 'canceled' })

  if (existing) {
    const mapping = await findPlanMappingByPriceId(app, tenant, existing.stripePriceId)
    if (mapping) {
      await publishRoleEvents(app, tenant, scope, mapping.grantedRoles, 'entitlement.role-revoked')
    }
  }
}

// `customer.subscription.paused`/`.resumed` -- Stripe's `pause_collection`
// state (a subscription stays otherwise intact, billing simply stops,
// distinct from cancellation). Unlike `onSubscriptionUpdated`, whose role
// diffing is keyed entirely off a *price* change, pause/resume never touch
// price -- so update-record-then-diff-by-price would silently grant/revoke
// nothing. Deliberately unconditional revoke/grant against the plan
// mapping's full `grantedRoles`, matching the same posture
// `onInvoicePaymentFailed`/`onDisputeCreated`/`onDisputeClosed` already use
// for other status-only degrade/restore transitions.
async function onSubscriptionPaused(app: FastifyInstance, tenant: string, sub: StripeSubscriptionObject) {
  const existing = await findSubscription(app, sub.id)
  const scope = existing?.scope ?? readScope(sub.metadata, { tenant })

  await app.consequent.handle(sub.id, 'subscription.update', {
    status: sub.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
  })

  const stripePriceId = existing?.stripePriceId ?? sub.items.data[0]?.price.id ?? ''
  const mapping = await findPlanMappingByPriceId(app, tenant, stripePriceId)
  if (mapping) {
    await publishRoleEvents(app, tenant, scope, mapping.grantedRoles, 'entitlement.role-revoked')
  }
}

async function onSubscriptionResumed(app: FastifyInstance, tenant: string, sub: StripeSubscriptionObject) {
  const existing = await findSubscription(app, sub.id)
  const scope = existing?.scope ?? readScope(sub.metadata, { tenant })

  await app.consequent.handle(sub.id, 'subscription.update', {
    status: sub.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
  })

  const stripePriceId = existing?.stripePriceId ?? sub.items.data[0]?.price.id ?? ''
  const mapping = await findPlanMappingByPriceId(app, tenant, stripePriceId)
  if (mapping) {
    await publishRoleEvents(app, tenant, scope, mapping.grantedRoles, 'entitlement.role-granted')
  }
}

// `invoice.payment_failed` -- Story 002 calls out "a tunable attempt-count
// threshold, not fixed here." This pilot slice degrades immediately on the
// first failure rather than tracking an attempt count across invoices --
// a deliberate simplification, not the full grace-period mechanism the
// story describes. Reuses the same `grantedRoles`-only degrade
// `charge.dispute.created` uses. Left as a documented follow-up (TESTING.md).
async function onInvoicePaymentFailed(app: FastifyInstance, tenant: string, invoice: StripeInvoiceObject) {
  const existing = await findSubscription(app, invoice.subscription)
  if (!existing) return
  const mapping = await findPlanMappingByPriceId(app, tenant, existing.stripePriceId)
  if (mapping) {
    await publishRoleEvents(app, tenant, existing.scope, mapping.grantedRoles, 'entitlement.role-revoked')
  }
}

async function onChargeRefunded(app: FastifyInstance, tenant: string, charge: StripeChargeObject) {
  const refund = charge.refunds?.data[0]
  if (!refund) return
  const customer = await findCustomerByStripeId(app, tenant, charge.customer)
  const scope = customer?.scope ?? readScope(charge.metadata, { tenant })
  const existing = await app.consequent.fetch('refund', refund.id)
  if ((existing!.state as unknown as { createdAt: string }).createdAt) return
  await app.consequent.handle(refund.id, 'refund.create', {
    stripeRefundId: refund.id,
    tenant,
    scope,
    stripeChargeId: charge.id,
    amount: refund.amount,
    currency: refund.currency,
    reason: refund.reason ?? '',
    refundedAt: new Date(refund.created * 1000).toISOString(),
  })
}

// A Stripe Dispute object carries `charge`, not `customer`/`subscription`
// directly, and this pilot's simplified Stripe object shapes don't model
// the full charge -> customer graph. `dispute.metadata.scope` (set the same
// way checkout-session metadata is, Story 002/003) is the resolution path
// used here -- a real deployment might instead expand the charge to reach
// its customer; documented as a simplification, not a full Stripe-object
// graph walk (TESTING.md).
async function onDisputeCreated(app: FastifyInstance, tenant: string, dispute: StripeDisputeObject) {
  const scope = readScope(dispute.metadata, { tenant })
  await app.consequent.handle(dispute.id, 'dispute.create', {
    stripeDisputeId: dispute.id,
    tenant,
    scope,
    stripeChargeId: dispute.charge,
    amount: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
  })

  // Reuses the exact `grantedRoles`-only degrade `invoice.payment_failed`
  // uses (Story 002).
  const subscription = await findSubscriptionByScope(app, tenant, scope)
  if (subscription) {
    const mapping = await findPlanMappingByPriceId(app, tenant, subscription.stripePriceId)
    if (mapping) {
      await publishRoleEvents(app, tenant, scope, mapping.grantedRoles, 'entitlement.role-revoked')
    }
  }
}

async function onDisputeClosed(app: FastifyInstance, tenant: string, dispute: StripeDisputeObject) {
  await app.consequent.handle(dispute.id, 'dispute.updateStatus', { status: dispute.status })

  if (dispute.status === 'won') {
    const scope = readScope(dispute.metadata, { tenant })
    const subscription = await findSubscriptionByScope(app, tenant, scope)
    if (subscription) {
      const mapping = await findPlanMappingByPriceId(app, tenant, subscription.stripePriceId)
      if (mapping) {
        await publishRoleEvents(app, tenant, scope, mapping.grantedRoles, 'entitlement.role-granted')
      }
    }
  }
}

async function handleStripeEvent(app: FastifyInstance, tenant: string, event: StripeWebhookEvent, client: StripeClient): Promise<void> {
  const object = event.data.object as unknown

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = object as StripeCheckoutSessionObject
      if (!session.subscription) return
      // `checkout.session.completed`'s own payload doesn't carry
      // subscription items/status without expansion -- retrieve the full
      // subscription record rather than depend on webhook payload
      // expansion configuration. Story 002 lists
      // `customer.subscription.created` as the paired trigger for this same
      // action -- when both arrive for one subscription (the common
      // real-world case), the second call is a safe no-op via
      // `onSubscriptionActivated`'s own existence check.
      const sub = await client.getSubscription(session.subscription)
      await onSubscriptionActivated(app, tenant, {
        id: sub.id,
        customer: sub.customer,
        status: sub.status,
        current_period_end: sub.currentPeriodEnd,
        items: { data: [{ price: { id: sub.stripePriceId } }] },
        metadata: (session.metadata ?? sub.metadata) as { scope?: string } | undefined,
      })
      return
    }
    case 'customer.subscription.created':
      await onSubscriptionActivated(app, tenant, object as StripeSubscriptionObject)
      return
    case 'customer.subscription.updated':
      await onSubscriptionUpdated(app, tenant, object as StripeSubscriptionObject)
      return
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(app, tenant, object as StripeSubscriptionObject)
      return
    case 'customer.subscription.paused':
      await onSubscriptionPaused(app, tenant, object as StripeSubscriptionObject)
      return
    case 'customer.subscription.resumed':
      await onSubscriptionResumed(app, tenant, object as StripeSubscriptionObject)
      return
    case 'invoice.payment_failed':
      await onInvoicePaymentFailed(app, tenant, object as StripeInvoiceObject)
      return
    case 'charge.refunded':
      await onChargeRefunded(app, tenant, object as StripeChargeObject)
      return
    case 'charge.dispute.created':
      await onDisputeCreated(app, tenant, object as StripeDisputeObject)
      return
    case 'charge.dispute.closed':
      await onDisputeClosed(app, tenant, object as StripeDisputeObject)
      return
    case 'account.updated':
      // Never applies -- Connect-specific, moot under the tenant-owned-
      // Stripe-account model. Received and ignored, not treated as an
      // error (Story 002).
      return
    default:
      return
  }
}

const webhookRoutes: FastifyPluginAsync = async function (app: FastifyInstance) {
  app.post('/_authstar/webhooks/stripe', { schema: { headers: tenantHeaderSchema } }, async (request, reply) => {
    const tenantSlug = request.headers['x-authstar-tenant-slug'] as string
    const signature = request.headers['stripe-signature'] as string

    const config = await app.stripeConfig.get(tenantSlug)
    if (!config) {
      return reply.code(404).send({ error: 'tenant has no stripe configuration' })
    }

    const client = app.stripeClients.dial(config.secretKey)
    let event
    try {
      event = client.verifyWebhookEvent((request as unknown as { rawBody: Buffer }).rawBody, signature, config.webhookSecret)
    } catch {
      // Stripe's own webhook signature is the actual authentication for
      // this route (Story 002) -- a mismatch is rejected outright, never
      // processed.
      return reply.code(400).send({ error: 'invalid stripe-signature' })
    }

    await handleStripeEvent(app, tenantSlug, event, client)
    return reply.code(200).send({ received: true })
  })
}

export default webhookRoutes
