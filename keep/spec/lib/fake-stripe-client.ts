import type {
  StripeClient,
  StripeClientFactory,
  StripePrice,
  CheckoutSessionParams,
  CheckoutSession,
  PortalSessionParams,
  PortalSession,
  StripeWebhookEvent,
  StripeSubscriptionSummary,
} from '../../src/lib/stripe-client.js'

// Fakes everything keep needs from Stripe (per this pilot's brief: no real
// Stripe credentials available -- stub Stripe behind an interface, fake it
// in tests). Signature verification is a simple sentinel check
// (`valid:<webhookSecret>`), not real HMAC -- proves keep's own dispatch
// logic (right event -> right actor commands -> right entitlement events),
// not Stripe's SDK internals (already Stripe's own responsibility to test).

export interface FakeStripeState {
  prices: Map<string, StripePrice>
  subscriptions: Map<string, StripeSubscriptionSummary>
  validApiKeys: Set<string>
  checkoutSessions: CheckoutSessionParams[]
  portalSessions: PortalSessionParams[]
}

export function createFakeStripeState(): FakeStripeState {
  return {
    prices: new Map(),
    subscriptions: new Map(),
    validApiKeys: new Set(),
    checkoutSessions: [],
    portalSessions: [],
  }
}

class FakeStripeClient implements StripeClient {
  constructor(private readonly apiKey: string, private readonly state: FakeStripeState) {}

  async getPrice(stripePriceId: string): Promise<StripePrice> {
    const price = this.state.prices.get(stripePriceId)
    if (!price) throw new Error(`no such price: ${stripePriceId}`)
    return price
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession> {
    this.state.checkoutSessions.push(params)
    const id = `cs_test_${this.state.checkoutSessions.length}`
    return { id, url: `https://checkout.stripe.test/${id}` }
  }

  async createPortalSession(params: PortalSessionParams): Promise<PortalSession> {
    this.state.portalSessions.push(params)
    const id = `bps_test_${this.state.portalSessions.length}`
    return { url: `https://billing.stripe.test/${id}` }
  }

  async getSubscription(stripeSubscriptionId: string): Promise<StripeSubscriptionSummary> {
    const sub = this.state.subscriptions.get(stripeSubscriptionId)
    if (!sub) throw new Error(`no such subscription: ${stripeSubscriptionId}`)
    return sub
  }

  verifyWebhookEvent(payload: string | Buffer, signature: string, webhookSecret: string): StripeWebhookEvent {
    if (signature !== `valid:${webhookSecret}`) {
      throw new Error('invalid signature')
    }
    const text = typeof payload === 'string' ? payload : payload.toString('utf8')
    return JSON.parse(text) as StripeWebhookEvent
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    return this.state.validApiKeys.has(apiKey)
  }
}

export function createFakeStripeClientFactory(state: FakeStripeState): StripeClientFactory {
  return { dial: (apiKey: string) => new FakeStripeClient(apiKey, state) }
}
