import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import { createFakePublisher, type FakePublisher } from '../lib/fake-publisher.js'
import { createInMemoryRateLimiter } from '../../src/lib/rate-limiter.js'

// Behavior tier: the public HTTP contract -- `fastify.inject()` against a
// real fastify instance (no real network), backed by a fake publisher (no
// real broker). Asserts exactly what's in Story 001's acceptance criteria:
// request/response shapes, status codes, and the specific rules (the
// AJV-stripping fix, the client-only defenses, the never-accept-IP rule).

describe('POST /events -- API contract', () => {
  let app: FastifyInstance
  let publisher: FakePublisher

  beforeEach(async () => {
    publisher = createFakePublisher()
    app = await buildApp({ publisher })
  })

  afterEach(async () => {
    await app.close()
  })

  describe('server-side-originated events (trusted, no size cap or allowlist)', () => {
    it('accepts a well-formed `request` event and publishes it with a generated eventId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'request',
          identityHash: 'hash-123',
          method: 'GET',
          path: '/users/12345/profile',
          status: 200,
          latencyMs: 42,
        },
      })

      expect(response.statusCode).toBe(202)
      const body = response.json()
      expect(typeof body.eventId).toBe('string')
      expect(body.eventId.length).toBeGreaterThan(0)

      expect(publisher.published).toHaveLength(1)
      const [published] = publisher.published
      expect(published.routingKey).toBe('analytics.request')
      expect(published.message.eventId).toBe(body.eventId)
      expect(published.message.tenant).toBe('acme')
      expect(published.message.application).toBe('portal')
      expect(published.message.method).toBe('GET')
      expect(published.message.status).toBe(200)
      expect(typeof published.message.timestamp).toBe('string')
    })

    it('accepts an `auth.login-succeeded` event with idp', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'auth.login-succeeded',
          identityHash: 'hash-123',
          idp: 'google',
        },
      })

      expect(response.statusCode).toBe(202)
      expect(publisher.published[0].routingKey).toBe('analytics.auth.login-succeeded')
      expect(publisher.published[0].message.idp).toBe('google')
    })

    it('accepts an `auth.login-failed` event with a coarse reason', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'auth.login-failed',
          idp: 'google',
          reason: 'token_exchange_failed',
        },
      })

      expect(response.statusCode).toBe(202)
      expect(publisher.published[0].message.reason).toBe('token_exchange_failed')
    })

    it('rejects a reason outside the coarse enum (400) -- never the raw provider error', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'auth.login-failed',
          reason: 'the upstream IdP returned a 500 with body: <html>...',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(publisher.published).toHaveLength(0)
    })

    it('omits identityHash entirely when no valid session existed -- not a null placeholder', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'auth.login-failed',
          reason: 'state_mismatch',
        },
      })

      expect(response.statusCode).toBe(202)
      expect('identityHash' in publisher.published[0].message).toBe(false)
    })

    it('has no allowlist restriction on server-side eventType beyond well-formedness', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'auth.invite-redeemed',
        },
      })

      expect(response.statusCode).toBe(202)
    })
  })

  describe('malformed / missing-field requests', () => {
    it('rejects a request missing the required eventType field (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: { tenant: 'acme', application: 'portal' },
      })

      expect(response.statusCode).toBe(400)
      expect(publisher.published).toHaveLength(0)
    })

    it('rejects a request missing the required tenant field (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: { application: 'portal', eventType: 'request' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects a malformed eventType (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: { tenant: 'acme', application: 'portal', eventType: 'Not A Valid Event!!' },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects an out-of-range status field (400)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: { tenant: 'acme', application: 'portal', eventType: 'request', status: 999 },
      })

      expect(response.statusCode).toBe(400)
    })

    it('rejects an empty body entirely (400)', async () => {
      const response = await app.inject({ method: 'POST', url: '/events', payload: {} })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('unknown fields -- proves the AJV removeAdditional fix', () => {
    it('rejects an unrecognized top-level field (400), never silently stripping it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'request',
          unexpectedField: 'should not be silently dropped',
        },
      })

      expect(response.statusCode).toBe(400)
      // If fastify's default `removeAdditional: true` were still in effect,
      // this would come back 202 with the field quietly stripped instead of
      // rejected -- the exact bug the pilot found and this service's
      // buildApp() explicitly overrides (`ajv: { customOptions: {
      // removeAdditional: false } }`).
      expect(publisher.published).toHaveLength(0)
    })

    it('rejects a client-asserted `ip` field -- structurally absent from the schema, never merely ignored (ADR 0035)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'request',
          ip: '203.0.113.7',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(publisher.published).toHaveLength(0)
    })
  })

  describe('client-originated events (semi-trusted, get extra defenses)', () => {
    it('accepts an allowlisted client event type with a payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'client.page-view',
          identityHash: 'hash-123',
          payload: { page: '/dashboard', referrer: '/login' },
        },
      })

      expect(response.statusCode).toBe(202)
      expect(publisher.published[0].routingKey).toBe('analytics.client.page-view')
      expect(publisher.published[0].message.payload).toEqual({ page: '/dashboard', referrer: '/login' })
    })

    it('rejects a client event type outside the allowlist (400), not forwarded as free-form data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'client.totally-made-up-event',
        },
      })

      expect(response.statusCode).toBe(400)
      expect(publisher.published).toHaveLength(0)
    })

    it('rejects a client payload over the size cap outright, not truncated', async () => {
      const oversizedPayload = { blob: 'x'.repeat(10_000) }

      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: {
          tenant: 'acme',
          application: 'portal',
          eventType: 'client.error',
          payload: oversizedPayload,
        },
      })

      expect(response.statusCode).toBe(413)
      expect(publisher.published).toHaveLength(0)
    })

    it('accepts a client event with no payload at all', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/events',
        payload: { tenant: 'acme', application: 'portal', eventType: 'client.button-click' },
      })

      expect(response.statusCode).toBe(202)
    })
  })

  describe('rate limiting -- client-originated events only, scoped per tenant/application/identityHash', () => {
    it('rejects once a client caller exceeds the configured limit (429)', async () => {
      const strictLimiterApp = await buildApp({
        publisher,
        rateLimiter: createInMemoryRateLimiter({ maxRequests: 2, windowMs: 60_000 }),
      })

      try {
        const payload = { tenant: 'acme', application: 'portal', eventType: 'client.page-view', identityHash: 'hash-1' }

        const first = await strictLimiterApp.inject({ method: 'POST', url: '/events', payload })
        const second = await strictLimiterApp.inject({ method: 'POST', url: '/events', payload })
        const third = await strictLimiterApp.inject({ method: 'POST', url: '/events', payload })

        expect(first.statusCode).toBe(202)
        expect(second.statusCode).toBe(202)
        expect(third.statusCode).toBe(429)
      } finally {
        await strictLimiterApp.close()
      }
    })

    it('never rate-limits server-side events, even past the configured client limit', async () => {
      const strictLimiterApp = await buildApp({
        publisher,
        rateLimiter: createInMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 }),
      })

      try {
        const payload = { tenant: 'acme', application: 'portal', eventType: 'request', method: 'GET', path: '/' }

        for (let i = 0; i < 5; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const response = await strictLimiterApp.inject({ method: 'POST', url: '/events', payload })
          expect(response.statusCode).toBe(202)
        }
      } finally {
        await strictLimiterApp.close()
      }
    })

    it('scopes the limit per identityHash -- a different identityHash gets its own budget', async () => {
      const strictLimiterApp = await buildApp({
        publisher,
        rateLimiter: createInMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 }),
      })

      try {
        const first = await strictLimiterApp.inject({
          method: 'POST',
          url: '/events',
          payload: { tenant: 'acme', application: 'portal', eventType: 'client.page-view', identityHash: 'hash-a' },
        })
        const second = await strictLimiterApp.inject({
          method: 'POST',
          url: '/events',
          payload: { tenant: 'acme', application: 'portal', eventType: 'client.page-view', identityHash: 'hash-b' },
        })

        expect(first.statusCode).toBe(202)
        expect(second.statusCode).toBe(202)
      } finally {
        await strictLimiterApp.close()
      }
    })
  })
})
