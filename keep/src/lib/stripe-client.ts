// Abstraction over everything keep needs from Stripe, so behavior/e2e tests
// can fake it (per this pilot's brief: "no real Stripe credentials -- stub
// Stripe API calls behind an interface you can fake in tests"). Production
// wiring (`createStripeClient`) uses the real `stripe` SDK; tests construct
// a `FakeStripeClient` (spec/lib/fake-stripe-client.ts) satisfying the same
// interface instead.
//
// One `StripeClient` per tenant Stripe secret key -- `StripeClientFactory`
// is what build-app.ts actually decorates onto the fastify instance, since
// every tenant owns its own Stripe account (ADR 0046) and a single shared
// client would be wrong.

import Stripe from 'stripe'

export interface StripePrice {
  unitAmount: number
  currency: string
  interval: 'month' | 'year'
}

export interface CheckoutSessionParams {
  stripePriceId: string
  stripeCustomerId?: string
  customerEmail?: string
  successUrl: string
  cancelUrl: string
  // Stripe has no concept of authstar's `scope` -- stashed in Checkout
  // Session metadata (carried onto the resulting Subscription/Customer
  // objects by Stripe automatically) so Story 002's webhook handling can
  // recover which scope a webhook event belongs to.
  metadata?: Record<string, string>
}

export interface CheckoutSession {
  id: string
  url: string
}

export interface StripeWebhookEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

export interface StripeSubscriptionSummary {
  id: string
  customer: string
  status: string
  currentPeriodEnd: number
  stripePriceId: string
  metadata: Record<string, string>
}

export interface StripeClient {
  getPrice(stripePriceId: string): Promise<StripePrice>
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession>
  // `checkout.session.completed`'s own payload doesn't carry subscription
  // items/status without expansion -- webhook handling retrieves the full
  // subscription record itself rather than depending on webhook payload
  // expansion configuration (Story 002).
  getSubscription(stripeSubscriptionId: string): Promise<StripeSubscriptionSummary>
  // Throws (synchronously-caught, always via a rejected promise from the
  // route's own try/catch -- not a consequent command handler) if the
  // signature doesn't match.
  verifyWebhookEvent(payload: string | Buffer, signature: string, webhookSecret: string): StripeWebhookEvent
  // Cheap validation call used by the stripe-config PATCH route (ADR 0054)
  // -- resolves true/false rather than throwing, so the route can turn a
  // bad key into a clean 4xx instead of a 500.
  validateApiKey(apiKey: string): Promise<boolean>
}

// One real client per tenant Stripe secret key -- `dial(apiKey)` is cheap
// (the Stripe SDK does no network I/O on construction), so no caching is
// needed here; the route layer resolves the tenant's key (via stripe-config,
// out of scope for this slice -- see TESTING.md) and dials fresh each time.
export interface StripeClientFactory {
  dial(apiKey: string): StripeClient
}

class RealStripeClient implements StripeClient {
  private readonly stripe: Stripe

  constructor(apiKey: string) {
    // No explicit `apiVersion` -- lets the SDK use its own pinned default
    // rather than this codebase tracking Stripe's API version string
    // separately (it's optional on `Stripe.StripeConfig`, confirmed against
    // the installed SDK's own types).
    this.stripe = new Stripe(apiKey)
  }

  async getPrice(stripePriceId: string): Promise<StripePrice> {
    const price = await this.stripe.prices.retrieve(stripePriceId)
    return {
      unitAmount: price.unit_amount ?? 0,
      currency: price.currency,
      interval: (price.recurring?.interval as 'month' | 'year') ?? 'month',
    }
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.stripePriceId, quantity: 1 }],
      customer: params.stripeCustomerId,
      customer_email: params.stripeCustomerId ? undefined : params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: params.metadata ? { metadata: params.metadata } : undefined,
      metadata: params.metadata,
    })
    return { id: session.id, url: session.url ?? '' }
  }

  async getSubscription(stripeSubscriptionId: string): Promise<StripeSubscriptionSummary> {
    const sub = await this.stripe.subscriptions.retrieve(stripeSubscriptionId)
    return {
      id: sub.id,
      customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      // `current_period_end` moved from the Subscription object to each
      // SubscriptionItem in Stripe's current API version (confirmed
      // against the installed SDK's own types, not assumed) -- read off
      // the first item, same place `stripePriceId` already comes from.
      currentPeriodEnd: sub.items.data[0]?.current_period_end ?? 0,
      stripePriceId: sub.items.data[0]?.price.id ?? '',
      metadata: sub.metadata,
    }
  }

  verifyWebhookEvent(payload: string | Buffer, signature: string, webhookSecret: string): StripeWebhookEvent {
    const event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret)
    return event as unknown as StripeWebhookEvent
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const probe = new Stripe(apiKey)
      await probe.balance.retrieve()
      return true
    } catch {
      return false
    }
  }
}

export function createStripeClientFactory(): StripeClientFactory {
  return { dial: (apiKey: string) => new RealStripeClient(apiKey) }
}
