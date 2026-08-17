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

  beforeEach(async () => {
    t = await buildLiveTestApp()
    headers = await t.headers({ permissions: ['billing:manage'] })
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
