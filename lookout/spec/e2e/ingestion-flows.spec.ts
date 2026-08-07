import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import { createFakePublisher, type FakePublisher } from '../lib/fake-publisher.js'
import { createInMemoryRateLimiter } from '../../src/lib/rate-limiter.js'

// End-to-end tier: realistic *sequences* of calls through the HTTP surface,
// still against the fake publisher (no external dependencies) -- what
// distinguishes this from the behavior tier is that each test here cares
// about a whole flow (a burst of mixed traffic, both of portcullis's real
// dispatch shapes back to back), not one call's contract in isolation.

describe('a burst of mixed valid/invalid events, as portcullis would actually send them', () => {
  let app: FastifyInstance
  let publisher: FakePublisher

  beforeEach(async () => {
    publisher = createFakePublisher()
    app = await buildApp({ publisher })
  })

  afterEach(async () => {
    await app.close()
  })

  it('accepts every valid event and rejects every invalid one, independently, in one storm', async () => {
    const requests = [
      // valid: server-side request telemetry
      { payload: { tenant: 'acme', application: 'portal', eventType: 'request', method: 'GET', path: '/dashboard', status: 200, latencyMs: 12 }, expectedStatus: 202 },
      // valid: server-side auth event, no session yet
      { payload: { tenant: 'acme', application: 'portal', eventType: 'auth.login-failed', idp: 'google', reason: 'pkce_missing' }, expectedStatus: 202 },
      // invalid: missing required `application`
      { payload: { tenant: 'acme', eventType: 'request' }, expectedStatus: 400 },
      // invalid: unknown field, must not be silently stripped and forwarded
      { payload: { tenant: 'acme', application: 'portal', eventType: 'request', sessionCookie: 'should-never-be-here' }, expectedStatus: 400 },
      // valid: allowlisted client event, identity attached by portcullis
      { payload: { tenant: 'acme', application: 'portal', eventType: 'client.page-view', identityHash: 'hash-42', payload: { page: '/pricing' } }, expectedStatus: 202 },
      // invalid: client event type not on the allowlist
      { payload: { tenant: 'acme', application: 'portal', eventType: 'client.made-up-type' }, expectedStatus: 400 },
      // invalid: client payload over the size cap
      { payload: { tenant: 'acme', application: 'portal', eventType: 'client.error', payload: { stack: 'x'.repeat(20_000) } }, expectedStatus: 413 },
    ] as const

    const responses = []
    for (const req of requests) {
      // Sequential, not Promise.all -- this models a realistic burst of
      // independent fire-and-forget calls, and keeps assertions attributable
      // to a specific request.
      // eslint-disable-next-line no-await-in-loop
      const response = await app.inject({ method: 'POST', url: '/events', payload: req.payload })
      responses.push(response)
    }

    responses.forEach((response, index) => {
      expect(response.statusCode, `request ${index} (${JSON.stringify(requests[index].payload)})`).toBe(requests[index].expectedStatus)
    })

    // Only the genuinely valid ones made it to the broker.
    expect(publisher.published).toHaveLength(3)
    const routingKeys = publisher.published.map((p) => p.routingKey).sort()
    expect(routingKeys).toEqual(['analytics.client.page-view', 'analytics.request', 'analytics.auth.login-failed'].sort())

    // Every published event still got a unique, generated eventId, even
    // under a burst -- proves node-flakes' sequence-within-a-millisecond
    // handling isn't accidentally colliding under rapid sequential calls.
    const eventIds = publisher.published.map((p) => p.message.eventId)
    expect(new Set(eventIds).size).toBe(eventIds.length)
  })
})

describe('server-side dispatch vs. client-side forwarded dispatch, same endpoint', () => {
  let app: FastifyInstance
  let publisher: FakePublisher

  beforeEach(async () => {
    publisher = createFakePublisher()
    app = await buildApp({ publisher })
  })

  afterEach(async () => {
    await app.close()
  })

  it('carries a full auth-funnel sequence (login attempt, failure, retry, success, signup) through to the broker correctly', async () => {
    // Mirrors portcullis's own direct dispatch -- fire-and-forget, one call
    // per meaningful auth-funnel moment (ADR 0035/0058).
    const failedAttempt = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { tenant: 'acme', application: 'portal', eventType: 'auth.login-failed', idp: 'google', reason: 'token_exchange_failed' },
    })
    const succeededAttempt = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { tenant: 'acme', application: 'portal', eventType: 'auth.login-succeeded', idp: 'google', identityHash: 'hash-99' },
    })
    const signup = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { tenant: 'acme', application: 'portal', eventType: 'auth.signup-completed', idp: 'google', identityHash: 'hash-99' },
    })

    expect(failedAttempt.statusCode).toBe(202)
    expect(succeededAttempt.statusCode).toBe(202)
    expect(signup.statusCode).toBe(202)

    expect(publisher.published.map((p) => p.routingKey)).toEqual([
      'analytics.auth.login-failed',
      'analytics.auth.login-succeeded',
      'analytics.auth.signup-completed',
    ])
    // The failed attempt happened before a session existed -- no identityHash.
    expect('identityHash' in publisher.published[0].message).toBe(false)
    // Both post-authentication events carry the same session's identityHash.
    expect(publisher.published[1].message.identityHash).toBe('hash-99')
    expect(publisher.published[2].message.identityHash).toBe('hash-99')
  })

  it('then a client-side page-view arrives via the forwarded route with server-verified identity already attached', async () => {
    const clientEvent = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        tenant: 'acme',
        application: 'portal',
        eventType: 'client.page-view',
        // Portcullis attaches this from the verified session itself --
        // never client-asserted, so this test's payload models exactly
        // what portcullis's forwarded route would send, not what a browser
        // would send directly (there is no browser-reachable path here).
        identityHash: 'hash-99',
        payload: { page: '/account/billing' },
      },
    })

    expect(clientEvent.statusCode).toBe(202)
    expect(publisher.published[0].routingKey).toBe('analytics.client.page-view')
    expect(publisher.published[0].message.identityHash).toBe('hash-99')
  })

  it('a client burst past the rate limit does not affect a concurrent server-side burst on the same tenant/application', async () => {
    const scopedApp = await buildApp({
      publisher,
      rateLimiter: createInMemoryRateLimiter({ maxRequests: 2, windowMs: 60_000 }),
    })

    try {
      const clientResults = []
      for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await scopedApp.inject({
          method: 'POST',
          url: '/events',
          payload: { tenant: 'acme', application: 'portal', eventType: 'client.button-click', identityHash: 'hash-1' },
        })
        clientResults.push(response.statusCode)
      }

      const serverResults = []
      for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await scopedApp.inject({
          method: 'POST',
          url: '/events',
          payload: { tenant: 'acme', application: 'portal', eventType: 'request', method: 'GET', path: '/' },
        })
        serverResults.push(response.statusCode)
      }

      expect(clientResults).toEqual([202, 202, 429, 429])
      expect(serverResults).toEqual([202, 202, 202, 202])
    } finally {
      await scopedApp.close()
    }
  })
})
