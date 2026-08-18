import Stripe from 'stripe'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import buildLiveTestApp, { LIVE_TEST_TENANT, liveStripeSecretKey, type LiveTestApp } from '../lib/live-stripe-app.js'

// Live tier: exercises keep's real Stripe integration (RealStripeClient,
// src/lib/stripe-client.ts) against Stripe's genuine test-mode API instead
// of spec/lib/fake-stripe-client.ts. Not run by `npm test`/`npm run
// test:all` -- opt in with `npm run test:live`, and only after exporting
// STRIPE_LIVE_TEST_SECRET_KEY (an sk_test_/rk_test_ key, see TESTING.md for
// setup). Skips cleanly (not a failure) when that var is unset, so it's
// safe to leave wired into a CI job that doesn't have Stripe credentials.
//
// What this tier catches that the fake can't: FakeStripeClient's
// verifyWebhookEvent is a sentinel string match, not real HMAC (spec/lib/
// fake-stripe-client.ts's own header comment) -- it can never catch drift
// in Stripe's signature-header format, timestamp tolerance, or how the
// installed `stripe` SDK's own webhooks.constructEvent behaves. Likewise
// getPrice/createCheckoutSession/validateApiKey against the fake only prove
// keep's own request/response *mapping* code compiles against a shape we
// hand-wrote ourselves, not that it matches what Stripe's real API actually
// returns.
const describeLive = describe.skipIf(!process.env.STRIPE_LIVE_TEST_SECRET_KEY)

describeLive('stripe integration -- live test-mode API', () => {
  let stripe: Stripe
  let priceId: string
  // Chosen locally, not fetched from Stripe's dashboard -- see
  // live-stripe-app.ts's header comment for why generateTestHeaderString/
  // constructEvent treat this as a plain shared secret, not a
  // dashboard-registered webhook endpoint's signing secret.
  const webhookSecret = 'whsec_live_test_tier_shared_secret'

  beforeAll(async () => {
    stripe = new Stripe(liveStripeSecretKey())
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: 1000,
      recurring: { interval: 'month' },
      product_data: { name: 'keep live-test-tier plan (safe to archive/delete)' },
    })
    priceId = price.id
  })

  afterAll(async () => {
    // Best-effort cleanup -- archive the Price (Stripe Prices can't be
    // deleted once created) and the Product under it, so re-runs don't pile
    // up test fixtures indefinitely. Not asserted on: a failure here
    // shouldn't fail the suite.
    try {
      await stripe.prices.update(priceId, { active: false })
      const price = await stripe.prices.retrieve(priceId)
      if (typeof price.product === 'string') {
        await stripe.products.update(price.product, { active: false })
      }
    } catch {
      // best-effort, see above
    }
  })

  let t: LiveTestApp
  let headers: { authorization: string }
  let readHeaders: { authorization: string }

  beforeEach(async () => {
    t = await buildLiveTestApp()
    headers = await t.headers({ permissions: ['billing:manage'] })
    readHeaders = await t.headers({ permissions: ['billing:read'] })
  })

  afterEach(async () => {
    await t.app.close()
  })

  describe('validateApiKey (PATCH /stripe-config)', () => {
    it('accepts a genuine test-mode secret key', async () => {
      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/${LIVE_TEST_TENANT}/stripe-config`,
        headers,
        payload: { secretKey: liveStripeSecretKey(), webhookSecret },
      })
      expect(response.statusCode).toBe(200)
    })

    it('rejects a garbage key -- a real 401 from Stripe, not a thrown exception', async () => {
      const response = await t.app.inject({
        method: 'PATCH',
        url: `/tenants/${LIVE_TEST_TENANT}/stripe-config`,
        headers,
        payload: { secretKey: 'sk_test_definitely_not_a_real_key', webhookSecret },
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('getPrice + createCheckoutSession (plan-mappings -> checkout-sessions)', () => {
    beforeEach(async () => {
      await t.stripeConfig.set(LIVE_TEST_TENANT, { secretKey: liveStripeSecretKey(), webhookSecret })
    })

    it('creates a plan mapping against a real Price (getPrice succeeds against the real API)', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: `/tenants/${LIVE_TEST_TENANT}/plan-mappings`,
        headers,
        payload: { stripePriceId: priceId, name: 'Live Basic' },
      })
      expect(response.statusCode).toBe(201)
    })

    it('creates a real Checkout Session with a genuine checkout.stripe.com URL', async () => {
      const mapping = await t.app
        .inject({
          method: 'POST',
          url: `/tenants/${LIVE_TEST_TENANT}/plan-mappings`,
          headers,
          payload: { stripePriceId: priceId, name: 'Live Basic' },
        })
        .then((r) => r.json())

      const response = await t.app.inject({
        method: 'POST',
        url: `/tenants/${LIVE_TEST_TENANT}/checkout-sessions`,
        headers,
        payload: {
          planMappingId: mapping.id,
          scope: { account: 'live-test-acct' },
          customerEmail: 'live-test@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.url).toContain('checkout.stripe.com')
    })
  })

  // `pm_card_visa` is a Stripe-documented test PaymentMethod token
  // (https://docs.stripe.com/testing#cards) -- attaches and charges
  // successfully without going through Checkout/Elements UI, so a real
  // `active` Subscription can exist entirely via the API, no browser needed.
  async function createActiveSubscription(stripe: Stripe, priceId: string, extra: Stripe.CustomerCreateParams = {}) {
    const customer = await stripe.customers.create({ email: `live-test+${Math.random().toString(36).slice(2)}@example.com`, ...extra })
    const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id })
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethod.id } })
    const subscription = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: priceId }], default_payment_method: paymentMethod.id })
    return { customer, subscription }
  }

  function subscriptionEventObject(sub: Stripe.Subscription, scope: Record<string, string>) {
    return {
      id: sub.id,
      customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      current_period_end: sub.items.data[0]?.current_period_end ?? 0,
      items: { data: [{ price: { id: sub.items.data[0]?.price.id ?? '' } }] },
      metadata: { scope: JSON.stringify(scope) },
    }
  }

  describe('getSubscription -- real object shape via checkout.session.completed', () => {
    beforeEach(async () => {
      await t.stripeConfig.set(LIVE_TEST_TENANT, { secretKey: liveStripeSecretKey(), webhookSecret })
    })

    it('correctly maps a real Stripe Subscription -- including current_period_end living on the SubscriptionItem, not the Subscription itself (stripe-client.ts\'s own flagged API-version gotcha)', async () => {
      const { customer, subscription } = await createActiveSubscription(stripe, priceId)
      expect(subscription.status).toBe('active')

      const eventPayload = JSON.stringify({
        id: `evt_live_${Math.random().toString(36).slice(2)}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_live_fake_session',
            customer: customer.id,
            subscription: subscription.id,
            metadata: { scope: JSON.stringify({ account: 'live-checkout-acct' }) },
          },
        },
      })
      const signature = stripe.webhooks.generateTestHeaderString({ payload: eventPayload, secret: webhookSecret })

      const response = await t.app.inject({
        method: 'POST',
        url: '/_authstar/webhooks/stripe',
        headers: { 'x-authstar-tenant-slug': LIVE_TEST_TENANT, 'stripe-signature': signature, 'content-type': 'application/json' },
        payload: eventPayload,
      })
      expect(response.statusCode).toBe(200)

      const subResponse = await t.app.inject({ method: 'GET', url: `/tenants/${LIVE_TEST_TENANT}/subscriptions/${subscription.id}`, headers: readHeaders })
      expect(subResponse.statusCode).toBe(200)
      const subBody = subResponse.json()
      expect(subBody.status).toBe('active')
      expect(subBody.stripePriceId).toBe(priceId)
      // A real future period end, proving getSubscription's real mapping
      // (stripe-client.ts:114-128) reads the field from the right place --
      // it silently returns 0 if the SDK's response shape ever moves again.
      expect(new Date(subBody.currentPeriodEnd).getTime()).toBeGreaterThan(Date.now())

      await stripe.subscriptions.cancel(subscription.id)
    })
  })

  describe('createPortalSession -- real Billing Portal session (ADR 0090)', () => {
    it('creates a genuine billing.stripe.com session URL for an organization\'s real stripe customer', async () => {
      const customer = await stripe.customers.create({ email: `live-portal+${Math.random().toString(36).slice(2)}@example.com` })
      await t.stripeConfig.set(LIVE_TEST_TENANT, { secretKey: liveStripeSecretKey(), webhookSecret })
      await t.consequent.handle(`cust_${customer.id}`, 'customer.create', {
        id: `cust_${customer.id}`,
        tenant: LIVE_TEST_TENANT,
        scope: { organization: 'org-live-portal-test' },
        stripeCustomerId: customer.id,
      })

      const orgHeaders = await t.headers({ organizationId: 'org-live-portal-test', permissions: ['organization:manage'] })
      const response = await t.app.inject({
        method: 'POST',
        url: `/tenants/${LIVE_TEST_TENANT}/organizations/org-live-portal-test/portal-sessions`,
        headers: orgHeaders,
        payload: { returnUrl: 'https://example.com/account' },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().url).toContain('billing.stripe.com')
    })
  })

  describe('subscription renewal via a Stripe test clock', () => {
    let clockId: string | undefined

    afterEach(async () => {
      if (!clockId) return
      // Deleting a test clock cascades to every customer/subscription
      // attached to it -- the only cleanup this block needs.
      await stripe.testHelpers.testClocks.del(clockId).catch(() => {})
      clockId = undefined
    })

    beforeEach(async () => {
      await t.stripeConfig.set(LIVE_TEST_TENANT, { secretKey: liveStripeSecretKey(), webhookSecret })
    })

    it('advances real simulated time to trigger a real billing-period renewal, and keep processes the resulting real object', async () => {
      const scope = { account: 'live-renewal-acct' }

      async function postEvent(type: string, sub: Stripe.Subscription) {
        const eventPayload = JSON.stringify({ id: `evt_live_${Math.random().toString(36).slice(2)}`, type, data: { object: subscriptionEventObject(sub, scope) } })
        const signature = stripe.webhooks.generateTestHeaderString({ payload: eventPayload, secret: webhookSecret })
        return t.app.inject({
          method: 'POST',
          url: '/_authstar/webhooks/stripe',
          headers: { 'x-authstar-tenant-slug': LIVE_TEST_TENANT, 'stripe-signature': signature, 'content-type': 'application/json' },
          payload: eventPayload,
        })
      }

      const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now() / 1000), name: 'keep live test tier' })
      clockId = clock.id

      const { subscription } = await createActiveSubscription(stripe, priceId, { test_clock: clockId })
      const initialPeriodEnd = subscription.items.data[0]?.current_period_end ?? 0

      // Seed keep's own subscription record first, the same way a real
      // integration receives customer.subscription.created before any
      // later renewal update.
      const created = await postEvent('customer.subscription.created', subscription)
      expect(created.statusCode).toBe(200)

      // Just past the subscription's own period end (itself ~1 interval
      // after the clock's creation time) -- Stripe caps a single advance at
      // "two intervals... based on the shortest subscription interval in
      // the test clock" (TestClockAdvanceParams's own doc comment, and
      // confirmed live: advancing periodEnd + 32 more days overshot that
      // ceiling and was rejected outright).
      const advanceTo = initialPeriodEnd + 24 * 60 * 60
      await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: advanceTo })

      // Advancing is asynchronous on Stripe's side -- poll until it reports
      // caught up, rather than assuming a fixed delay is long enough.
      let status: Stripe.TestHelpers.TestClock.Status = clock.status
      for (let i = 0; i < 30 && status !== 'ready'; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        status = (await stripe.testHelpers.testClocks.retrieve(clockId)).status
      }
      expect(status).toBe('ready')

      // The clock reporting "ready" only means Stripe caught up to the
      // target time, not that every downstream side effect (invoicing,
      // rolling the subscription to its next period) has necessarily
      // settled yet -- confirmed live: reading immediately after "ready"
      // sometimes still showed the pre-renewal period end. Poll a few more
      // times rather than assume the first read is authoritative.
      let renewed = await stripe.subscriptions.retrieve(subscription.id)
      let renewedPeriodEnd = renewed.items.data[0]?.current_period_end ?? 0
      for (let i = 0; i < 10 && renewedPeriodEnd <= initialPeriodEnd; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        renewed = await stripe.subscriptions.retrieve(subscription.id)
        renewedPeriodEnd = renewed.items.data[0]?.current_period_end ?? 0
      }
      // The actual proof real time passed: Stripe genuinely rolled the
      // subscription into a new billing period, not something this test
      // fabricated.
      expect(renewedPeriodEnd).toBeGreaterThan(initialPeriodEnd)

      const updated = await postEvent('customer.subscription.updated', renewed)
      expect(updated.statusCode).toBe(200)

      const subResponse = await t.app.inject({ method: 'GET', url: `/tenants/${LIVE_TEST_TENANT}/subscriptions/${subscription.id}`, headers: readHeaders })
      const subBody = subResponse.json()
      expect(new Date(subBody.currentPeriodEnd).getTime()).toBe(renewedPeriodEnd * 1000)
    }, 60_000) // generous override -- polling a real test-clock advance takes real wall-clock seconds, well past the file's default 30s
  })

  describe('webhook signature verification -- real HMAC via the installed stripe SDK', () => {
    beforeEach(async () => {
      await t.stripeConfig.set(LIVE_TEST_TENANT, { secretKey: liveStripeSecretKey(), webhookSecret })
    })

    function eventPayload(type: string, object: Record<string, unknown> = {}) {
      return JSON.stringify({ id: `evt_live_${Math.random().toString(36).slice(2)}`, type, data: { object } })
    }

    async function post(payload: string, signature: string) {
      return t.app.inject({
        method: 'POST',
        url: '/_authstar/webhooks/stripe',
        headers: { 'x-authstar-tenant-slug': LIVE_TEST_TENANT, 'stripe-signature': signature, 'content-type': 'application/json' },
        payload,
      })
    }

    it('accepts a genuinely-signed event -- real constructEvent, not the fake sentinel check', async () => {
      const payload = eventPayload('account.updated')
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })

      const response = await post(payload, signature)
      expect(response.statusCode).toBe(200)
    })

    it('rejects a tampered payload -- the signature no longer matches the (different) bytes received', async () => {
      const payload = eventPayload('account.updated')
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
      const tampered = payload.replace('account.updated', 'account.updated.evil')

      const response = await post(tampered, signature)
      expect(response.statusCode).toBe(400)
    })

    it('rejects a signature computed with the wrong secret', async () => {
      const payload = eventPayload('account.updated')
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_a_different_secret' })

      const response = await post(payload, signature)
      expect(response.statusCode).toBe(400)
    })

    it('rejects an expired signature -- real timestamp-tolerance enforcement the fake never checks', async () => {
      const payload = eventPayload('account.updated')
      // Stripe's default tolerance is 5 minutes (300s); constructEvent is
      // called with no explicit tolerance override (stripe-client.ts:131),
      // so the SDK's own default applies here too.
      const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret, timestamp: oneHourAgo })

      const response = await post(payload, signature)
      expect(response.statusCode).toBe(400)
    })
  })
})
