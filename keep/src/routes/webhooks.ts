import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { searchCriteria } from '../lib/consequent-types.js'
import type { StripeWebhookEvent, StripeClient, StripeSubscriptionSummary } from '../lib/stripe-client.js'
import type { CustomerState } from '../actors/customer_actor.js'
import type { DisputeState } from '../actors/dispute_actor.js'
import type { PlanMappingState, GrantedRole } from '../actors/plan_mapping_actor.js'
import { entitlementOf, isSubscriptionStatus, type SubscriptionEntitlement, type SubscriptionState, type SubscriptionStatus } from '../actors/subscription_actor.js'
import type { TrialState } from '../actors/trial_actor.js'
import { stripeEventKey, type StripeEventState } from '../actors/stripe_event_actor.js'
import generateId from '../lib/ids.js'
import { scopesEqual, isValidScope, type Scope } from '../lib/scope.js'
import { effectivePaymentFailureAttempts } from '../lib/stripe-config.js'

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
  // Kept only as a fallback below -- current API versions no longer set this
  // top-level field on the real webhook payload (see `periodEnd`).
  current_period_end?: number
  items: { data: Array<{ price: { id: string }, current_period_end?: number }> }
  metadata?: { scope?: string }
}

// `current_period_end` moved from the Subscription object to each
// SubscriptionItem in the API version this account is pinned to (the same
// gotcha `stripe-client.ts`'s `getSubscription` already normalizes for the
// `checkout.session.completed` path) -- a raw `customer.subscription.*`
// webhook payload only carries it on `items.data[0]`, not on the
// Subscription object itself. Falls back to the top-level field so
// fixtures/API versions that still set it there keep working.
function periodEnd(sub: StripeSubscriptionObject): number {
  return sub.items.data[0]?.current_period_end ?? sub.current_period_end ?? 0
}

// Every subscription handler works on the one normalized shape
// `getSubscription` returns, so a raw `customer.subscription.*` payload is
// normalized here and the checkout path passes its summary straight through.
function summarize(sub: StripeSubscriptionObject): StripeSubscriptionSummary {
  return {
    id: sub.id,
    customer: sub.customer,
    status: sub.status,
    currentPeriodEnd: periodEnd(sub),
    stripePriceId: sub.items.data[0]?.price.id ?? '',
    metadata: (sub.metadata ?? {}) as Record<string, string>,
  }
}

function periodEndIso(sub: StripeSubscriptionSummary): string {
  return new Date(sub.currentPeriodEnd * 1000).toISOString()
}

// ADR 0107: the status Stripe sent, narrowed to the statuses keep mirrors.
// A status outside them is logged and refused: the event stores nothing and
// publishes nothing, and Stripe still gets its 200, since a redelivery would
// carry the same status.
function mirroredStatus(app: FastifyInstance, tenant: string, sub: StripeSubscriptionSummary): SubscriptionStatus | undefined {
  if (isSubscriptionStatus(sub.status)) return sub.status
  app.log.warn({ tenant, stripeSubscriptionId: sub.id, status: sub.status }, 'stripe subscription status not recognized')
  return undefined
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
}

interface StripeInvoiceObject {
  subscription: string
  customer: string
  attempt_count?: number
  // Unix seconds; null once Stripe has no retry left to make.
  next_payment_attempt?: number | null
}

// ADR 0109: the scope in a Stripe object's metadata, when it is `{account}`
// or `{organization}`. There is no `{tenant}` fallback: an object with no
// such scope entitles no one, and keep publishes nothing for it.
function readScope(metadata: { scope?: string } | undefined): Scope | undefined {
  if (!metadata?.scope) return undefined
  try {
    const parsed: unknown = JSON.parse(metadata.scope)
    return isValidScope(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

// A stored record's scope, unless it is the `{tenant}` scope a record
// persisted before ADR 0109 may still hold.
function storedScope(scope: unknown): Scope | undefined {
  return isValidScope(scope) ? scope : undefined
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

// ADR 0100: every keep `Scope` (`{account}|{organization}`, ADR 0109) is a
// valid entitlement target directly -- `{organization}` publishes
// straight to the organization itself, no fan-out to its members. This
// replaced ADR 0098's manager-resolution step entirely (and the
// `organization-manager-cache.ts`/`organization-reference-consumer.ts`
// infrastructure it needed) -- simpler, and it's also what keeps
// org-purchased entitlement off any individual member's own `account.roles`.
async function publishRoleEvents(app: FastifyInstance, tenant: string, scope: Scope, roles: GrantedRole[], eventType: 'entitlement.role-granted' | 'entitlement.role-revoked') {
  for (const role of roles) {
    const sequence = await app.sequences.next(tenant, scope)
    await app.entitlements.publish({
      type: eventType,
      tenant,
      scope,
      sequence,
      role: { name: role.role, scope: role.application },
    })
  }
}

// ADR 0107: statuses under which a degraded subscription's plan roles may be
// restored. A canceled subscription stays degraded.
const RESTORABLE_STATUSES: readonly SubscriptionStatus[] = ['active', 'trialing']

// Statuses Stripe mirrors onto a subscription that end its grace period
// before the attempt threshold does, or stop its billing (ADR 0107).
const DEGRADING_STATUSES: readonly SubscriptionStatus[] = ['unpaid', 'canceled', 'paused']

// ADR 0107's degrade and restore, in one place: moves the subscription's
// entitlement to `target`, publishing one `role-revoked` (degrade) or
// `role-granted` (restore) per role of its plan mapping, then recording the
// new state. A no-op when the subscription is already in `target`, unknown,
// or, for a restore, not `active` or `trialing`. Returns whether it changed
// the record. Publishes before it records, so a failure part-way leaves the
// record in its old state and a redelivery publishes again; tower's grant and
// revoke are set operations, so a repeat is harmless.
async function setEntitlement(app: FastifyInstance, tenant: string, stripeSubscriptionId: string, target: SubscriptionEntitlement): Promise<boolean> {
  const subscription = await findSubscription(app, stripeSubscriptionId)
  if (!subscription || entitlementOf(subscription) === target) return false
  if (target === 'granted' && !RESTORABLE_STATUSES.includes(subscription.status)) return false

  const scope = storedScope(subscription.scope)
  const mapping = await findPlanMappingByPriceId(app, tenant, subscription.stripePriceId)
  if (scope && mapping) {
    await publishRoleEvents(app, tenant, scope, mapping.roles, target === 'degraded' ? 'entitlement.role-revoked' : 'entitlement.role-granted')
  }
  await app.consequent.handle(stripeSubscriptionId, target === 'degraded' ? 'subscription.degrade' : 'subscription.restore', {})
  return true
}

async function publishSeatLimitIfSet(app: FastifyInstance, tenant: string, scope: Scope, seatLimit: number | null) {
  // Seats belong to organizations (ADR 0100, ADR 0109); an account has none.
  if (seatLimit === null || !('organization' in scope)) return
  const sequence = await app.sequences.next(tenant, scope)
  await app.entitlements.publish({
    type: 'entitlement.seat-limit-changed',
    tenant,
    scope,
    sequence,
    seatLimit,
  })
}

// design/adrs/0101-api-keys.md: mirrors `publishSeatLimitIfSet`'s
// null-is-silent convention (a mapping that never set a limit publishes
// nothing, rather than an explicit "unlimited" event on every activation),
// but -- unlike that function -- does **not** restrict `scope` to
// `{tenant}|{organization}`. An individual account's own API-key allowance
// is meaningful (unlike seats), so `{account}` scope publishes here too;
// a non-null limit is the only gate needed.
async function publishApiKeyLimitIfSet(app: FastifyInstance, tenant: string, scope: Scope, apiKeyLimit: number | null) {
  if (apiKeyLimit === null) return
  const sequence = await app.sequences.next(tenant, scope)
  await app.entitlements.publish({
    type: 'entitlement.api-key-limit-changed',
    tenant,
    scope,
    sequence,
    apiKeyLimit,
  })
}

async function publishApiKeyRateLimitIfSet(app: FastifyInstance, tenant: string, scope: Scope, apiKeyRateLimit: { requestsPerMinute: number, burst?: number } | null) {
  if (apiKeyRateLimit === null) return
  const sequence = await app.sequences.next(tenant, scope)
  await app.entitlements.publish({
    type: 'entitlement.api-key-rate-limit-changed',
    tenant,
    scope,
    sequence,
    apiKeyRateLimit,
  })
}

// Shared by `checkout.session.completed`/`customer.subscription.created`
// and, indirectly, subscription renewal -- creates/updates the `customer`
// and `subscription` records, converts an in-progress trial if one exists,
// and publishes the informational `converted-to-paid` event plus one
// `role-granted` per role the matching plan mapping lists (Story 002:
// "one per role... not one event carrying an array").
async function onSubscriptionActivated(app: FastifyInstance, tenant: string, sub: StripeSubscriptionSummary) {
  const status = mirroredStatus(app, tenant, sub)
  if (!status) return
  const knownCustomer = await findCustomerByStripeId(app, tenant, sub.customer)
  const scope = readScope(sub.metadata) ?? storedScope(knownCustomer?.scope)
  if (!scope) {
    // ADR 0109: no `{tenant}` fallback. A subscription with no account or
    // organization scope is recorded nowhere and publishes nothing.
    app.log.warn({ tenant, stripeSubscriptionId: sub.id }, 'stripe subscription has no account or organization scope')
    return
  }
  const customer = await findOrCreateCustomer(app, tenant, scope, sub.customer)
  const stripePriceId = sub.stripePriceId
  const mapping = await findPlanMappingByPriceId(app, tenant, stripePriceId)

  const alreadyExists = await findSubscription(app, sub.id)
  if (!alreadyExists) {
    await app.consequent.handle(sub.id, 'subscription.create', {
      stripeSubscriptionId: sub.id,
      tenant,
      scope: storedScope(customer.scope) ?? scope,
      stripePriceId,
      status,
      currentPeriodEnd: periodEndIso(sub),
    })
  }

  const trial = await findActiveTrial(app, tenant, scope)
  if (trial) {
    await app.consequent.handle(trial.id, 'trial.convert', {})
  }

  // A subscription keep already records was activated before, by another
  // event with its own id: `customer.subscription.created` and
  // `checkout.session.completed` both arrive for one subscription. Its
  // conversion and grants went out then, so this activation publishes nothing.
  if (alreadyExists) return

  const sequence = await app.sequences.next(tenant, scope)
  const roles = (mapping?.roles ?? []).map((role) => ({ name: role.role, scope: role.application }))
  await app.entitlements.publish({ type: 'entitlement.converted-to-paid', tenant, scope, sequence, roles })

  if (mapping) {
    await publishRoleEvents(app, tenant, scope, mapping.roles, 'entitlement.role-granted')
    await publishSeatLimitIfSet(app, tenant, scope, mapping.seatLimit)
    await publishApiKeyLimitIfSet(app, tenant, scope, mapping.apiKeyLimit)
    await publishApiKeyRateLimitIfSet(app, tenant, scope, mapping.apiKeyRateLimit)
  }
}

// A status-only update, with no change of price, writes the status Stripe
// sent and publishes nothing (ADR 0107), unless that status is `unpaid`,
// `canceled`, or `paused`, which degrades. A price change publishes the role
// delta between the two plans only while the plan's roles are in effect: a
// degraded subscription's roles are revoked, and a restore grants the new
// plan's roles in full.
async function onSubscriptionUpdated(app: FastifyInstance, tenant: string, sub: StripeSubscriptionSummary) {
  const status = mirroredStatus(app, tenant, sub)
  if (!status) return
  const existing = await findSubscription(app, sub.id)
  const scope = storedScope(existing?.scope) ?? readScope(sub.metadata)
  const previousPriceId = existing?.stripePriceId
  const newPriceId = sub.stripePriceId

  await app.consequent.handle(sub.id, 'subscription.update', {
    status,
    stripePriceId: newPriceId,
    currentPeriodEnd: periodEndIso(sub),
  })

  const rolesInEffect = existing !== undefined && entitlementOf(existing) === 'granted'
  if (scope && rolesInEffect && previousPriceId && previousPriceId !== newPriceId) {
    const [previousMapping, newMapping] = await Promise.all([
      findPlanMappingByPriceId(app, tenant, previousPriceId),
      findPlanMappingByPriceId(app, tenant, newPriceId),
    ])
    const diff = diffRoles(previousMapping?.roles ?? [], newMapping?.roles ?? [])
    await publishRoleEvents(app, tenant, scope, diff.granted, 'entitlement.role-granted')
    await publishRoleEvents(app, tenant, scope, diff.revoked, 'entitlement.role-revoked')
    if (newMapping) {
      await publishSeatLimitIfSet(app, tenant, scope, newMapping.seatLimit)
      await publishApiKeyLimitIfSet(app, tenant, scope, newMapping.apiKeyLimit)
      await publishApiKeyRateLimitIfSet(app, tenant, scope, newMapping.apiKeyRateLimit)
    }
  }

  if (DEGRADING_STATUSES.includes(status)) {
    await setEntitlement(app, tenant, sub.id, 'degraded')
  }
}

async function onSubscriptionDeleted(app: FastifyInstance, tenant: string, sub: StripeSubscriptionSummary) {
  const status = mirroredStatus(app, tenant, sub)
  if (!status) return
  await app.consequent.handle(sub.id, 'subscription.update', { status, currentPeriodEnd: periodEndIso(sub) })

  // An `incomplete_expired` subscription never started, and revokes nothing (ADR 0107).
  if (status !== 'incomplete_expired') {
    await setEntitlement(app, tenant, sub.id, 'degraded')
  }
}

// `customer.subscription.paused`/`.resumed` -- Stripe's `pause_collection`
// state (a subscription stays otherwise intact, billing simply stops,
// distinct from cancellation). Pause and resume never touch price, so they
// degrade and restore the plan's full `roles` (ADR 0107).
async function onSubscriptionPaused(app: FastifyInstance, tenant: string, sub: StripeSubscriptionSummary) {
  const status = mirroredStatus(app, tenant, sub)
  if (!status) return
  await app.consequent.handle(sub.id, 'subscription.update', {
    status,
    currentPeriodEnd: periodEndIso(sub),
  })
  await setEntitlement(app, tenant, sub.id, 'degraded')
}

async function onSubscriptionResumed(app: FastifyInstance, tenant: string, sub: StripeSubscriptionSummary) {
  const status = mirroredStatus(app, tenant, sub)
  if (!status) return
  await app.consequent.handle(sub.id, 'subscription.update', {
    status,
    currentPeriodEnd: periodEndIso(sub),
  })
  await setEntitlement(app, tenant, sub.id, 'granted')
}

// `invoice.payment_failed` -- ADR 0107's grace period. Stripe runs dunning
// and reports the invoice's `attempt_count`; keep records it with the next
// retry and publishes nothing until the count reaches the tenant's
// `paymentFailureAttempts` (default 3), when it degrades. The status is left
// alone: Stripe sends `customer.subscription.updated` with `past_due` beside it.
async function onInvoicePaymentFailed(app: FastifyInstance, tenant: string, invoice: StripeInvoiceObject) {
  const existing = await findSubscription(app, invoice.subscription)
  if (!existing) return
  const attemptCount = invoice.attempt_count ?? 1
  const nextPaymentAttempt = typeof invoice.next_payment_attempt === 'number' ? new Date(invoice.next_payment_attempt * 1000).toISOString() : null
  await app.consequent.handle(invoice.subscription, 'subscription.recordPaymentFailure', { attemptCount, nextPaymentAttempt })

  const threshold = await effectivePaymentFailureAttempts(app.stripeConfig, tenant)
  if (attemptCount >= threshold) {
    await setEntitlement(app, tenant, invoice.subscription, 'degraded')
  }
}

// `invoice.paid` -- ends a grace period: clears the failure record, and
// restores a degraded subscription whose status is `active` or `trialing`
// (ADR 0107). Stripe does not order `invoice.paid` against the
// `customer.subscription.updated` that moves the status back to `active`, so
// a degraded subscription whose mirrored status is not yet restorable reads
// its status from Stripe first. Only a degraded subscription makes that read.
async function onInvoicePaid(app: FastifyInstance, tenant: string, invoice: StripeInvoiceObject, client: StripeClient) {
  const existing = await findSubscription(app, invoice.subscription)
  if (!existing) return
  if (existing.lastFailedAttempt !== null || existing.nextPaymentAttempt !== null) {
    await app.consequent.handle(invoice.subscription, 'subscription.recordPayment', {})
  }
  if (entitlementOf(existing) !== 'degraded') return

  if (!RESTORABLE_STATUSES.includes(existing.status)) {
    const current = await client.getSubscription(invoice.subscription)
    const status = mirroredStatus(app, tenant, current)
    if (!status) return
    await app.consequent.handle(invoice.subscription, 'subscription.update', { status, currentPeriodEnd: periodEndIso(current) })
  }
  await setEntitlement(app, tenant, invoice.subscription, 'granted')
}

async function onChargeRefunded(app: FastifyInstance, tenant: string, charge: StripeChargeObject) {
  const refund = charge.refunds?.data[0]
  if (!refund) return
  const customer = await findCustomerByStripeId(app, tenant, charge.customer)
  // No account or organization scope: the refund is still recorded, with `null`.
  const scope = storedScope(customer?.scope) ?? readScope(charge.metadata) ?? null
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

// The subscription a dispute degrades: of the scope's subscriptions, the
// first whose plan roles are in effect, else the first that has not ended.
// A canceled or never-started (`incomplete_expired`) subscription has no
// roles to take away (ADR 0107).
async function findDisputedSubscription(app: FastifyInstance, tenant: string, scope: Scope): Promise<SubscriptionState | undefined> {
  const instances = await app.consequent.find('subscription', searchCriteria({ tenant }))
  const candidates = instances
    .map((i) => i.state as unknown as SubscriptionState)
    .filter((s) => scopesEqual(s.scope, scope) && s.status !== 'canceled' && s.status !== 'incomplete_expired')
  return candidates.find((s) => entitlementOf(s) === 'granted') ?? candidates[0]
}

// `charge.dispute.created` -- ADR 0107: a Dispute carries its `charge`, not
// its customer, and Stripe does not copy a checkout's `scope` onto it. Keep retrieves the
// charge, finds its customer record by Stripe customer id, and degrades that
// scope's subscription through `setEntitlement`. With no customer record the
// dispute is recorded with `null` scope and changes no entitlement. A failed
// charge read throws, so the webhook answers 500 and Stripe redelivers.
//
// The dispute names the subscription before the degrade publishes, so a
// failure between the two is finished by the redelivery, and the record
// still knows what a won dispute restores. A subscription already degraded
// is not named: the dispute took nothing away, and a won dispute restores
// nothing.
async function onDisputeCreated(app: FastifyInstance, tenant: string, dispute: StripeDisputeObject, client: StripeClient) {
  const charge = await client.retrieveCharge(dispute.charge)
  const customer = charge.customer ? await findCustomerByStripeId(app, tenant, charge.customer) : undefined
  const scope = storedScope(customer?.scope) ?? null

  const existing = await app.consequent.fetch('dispute', dispute.id)
  const record = existing!.state as unknown as DisputeState
  if (!record.createdAt) {
    await app.consequent.handle(dispute.id, 'dispute.create', {
      stripeDisputeId: dispute.id,
      tenant,
      scope,
      stripeChargeId: dispute.charge,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
    })
  }

  if (!scope) return
  const subscription = await findDisputedSubscription(app, tenant, scope)
  if (!subscription) return
  const named = record.degradedSubscriptionId === subscription.stripeSubscriptionId
  if (!named && entitlementOf(subscription) !== 'granted') return
  if (!named) {
    await app.consequent.handle(dispute.id, 'dispute.recordDegrade', { stripeSubscriptionId: subscription.stripeSubscriptionId })
  }
  await setEntitlement(app, tenant, subscription.stripeSubscriptionId, 'degraded')
}

// `charge.dispute.closed` -- `won` restores only the subscription this
// dispute degraded (ADR 0077, ADR 0107); `lost` changes the dispute's status
// and nothing else.
async function onDisputeClosed(app: FastifyInstance, tenant: string, dispute: StripeDisputeObject) {
  await app.consequent.handle(dispute.id, 'dispute.updateStatus', { status: dispute.status })
  if (dispute.status !== 'won') return

  const fetched = await app.consequent.fetch('dispute', dispute.id)
  const record = fetched!.state as unknown as DisputeState
  if (record.degradedSubscriptionId) {
    await setEntitlement(app, tenant, record.degradedSubscriptionId, 'granted')
  }
}

// Whether keep has already handled this tenant's Stripe event.
async function isProcessed(app: FastifyInstance, tenant: string, stripeEventId: string): Promise<boolean> {
  const instance = await app.consequent.fetch('stripeEvent', stripeEventKey(tenant, stripeEventId))
  const state = instance!.state as unknown as StripeEventState
  return state.processedAt !== ''
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
      // real-world case), the second call records nothing and publishes
      // nothing, via `onSubscriptionActivated`'s own existence check.
      const sub = await client.getSubscription(session.subscription)
      await onSubscriptionActivated(app, tenant, { ...sub, metadata: (session.metadata as Record<string, string> | undefined) ?? sub.metadata })
      return
    }
    case 'customer.subscription.created':
      await onSubscriptionActivated(app, tenant, summarize(object as StripeSubscriptionObject))
      return
    case 'customer.subscription.updated':
      await onSubscriptionUpdated(app, tenant, summarize(object as StripeSubscriptionObject))
      return
    case 'customer.subscription.deleted':
      await onSubscriptionDeleted(app, tenant, summarize(object as StripeSubscriptionObject))
      return
    case 'customer.subscription.paused':
      await onSubscriptionPaused(app, tenant, summarize(object as StripeSubscriptionObject))
      return
    case 'customer.subscription.resumed':
      await onSubscriptionResumed(app, tenant, summarize(object as StripeSubscriptionObject))
      return
    case 'invoice.payment_failed':
      await onInvoicePaymentFailed(app, tenant, object as StripeInvoiceObject)
      return
    case 'invoice.paid':
      await onInvoicePaid(app, tenant, object as StripeInvoiceObject, client)
      return
    case 'charge.refunded':
      await onChargeRefunded(app, tenant, object as StripeChargeObject)
      return
    case 'charge.dispute.created':
      await onDisputeCreated(app, tenant, object as StripeDisputeObject, client)
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

    // Each Stripe event is handled once (S-0005). A redelivery of an event
    // keep recorded answers 200 and runs no handler. The record is written
    // only after the handler succeeds, so an event whose handler threw is
    // handled again when Stripe redelivers it.
    // Stripe gives every event an id; one without an id cannot be told
    // from its redelivery, and is refused rather than handled unguarded.
    if (typeof event.id !== 'string' || event.id === '') {
      return reply.code(400).send({ error: 'stripe event has no id' })
    }
    if (await isProcessed(app, tenantSlug, event.id)) {
      return reply.code(200).send({ received: true, duplicate: true })
    }
    await handleStripeEvent(app, tenantSlug, event, client)
    await app.consequent.handle(stripeEventKey(tenantSlug, event.id), 'stripeEvent.record', {
      tenant: tenantSlug,
      stripeEventId: event.id,
      type: event.type,
    })
    return reply.code(200).send({ received: true })
  })
}

export default webhookRoutes
