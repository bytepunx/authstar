import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import InMemoryClickHouseClient from '../lib/in-memory-clickhouse.js'
import { buildTestConfig } from '../lib/test-config.js'
import { bearerHeader } from '../lib/jwt.js'
import type { AnalyticsEventRow } from '../../src/lib/types.js'

// Behavior tier: `GET /tenants/:tenantSlug/analytics/reports/auth-funnel`
// against `fastify.inject()`, backed by the in-memory `ClickHouseApi` fake
// -- request/response shapes, status codes, and Story 002's specific
// acceptance criteria (by-provider counts, signup conversion, the named
// invite-redemption limitation).

function row(overrides: Partial<AnalyticsEventRow>): AnalyticsEventRow {
  return {
    tenant: 'acme',
    application: 'app1',
    eventType: 'request',
    timestamp: '2026-08-01T12:00:00.000Z',
    identityHash: null,
    idp: null,
    reason: null,
    method: null,
    path: null,
    status: null,
    latencyMs: null,
    clientPayload: null,
    eventId: 'evt-1',
    ...overrides,
  }
}

describe('GET /tenants/:tenantSlug/analytics/reports/auth-funnel', () => {
  let app: FastifyInstance
  let clickhouse: InMemoryClickHouseClient

  beforeEach(async () => {
    clickhouse = new InMemoryClickHouseClient()
    app = await buildApp({ clickhouse, config: buildTestConfig() })
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects a request with no bearer token (401)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/auth-funnel?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z',
    })
    expect(response.statusCode).toBe(401)
  })

  it('rejects a token lacking analytics:read (403)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/auth-funnel?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z',
      headers: await bearerHeader(['some-other:permission']),
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects a date range beyond the configured maximum (400)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/auth-funnel?from=2020-01-01T00:00:00Z&to=2026-08-02T00:00:00Z',
      headers: await bearerHeader(),
    })
    expect(response.statusCode).toBe(400)
  })

  it('computes login attempts/success/failure by provider, signup conversion, and invite redemption count', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'auth.login-succeeded', idp: 'google', eventId: '1' }),
      row({ eventType: 'auth.login-succeeded', idp: 'google', eventId: '2' }),
      row({ eventType: 'auth.login-failed', idp: 'google', reason: 'token_exchange_failed', eventId: '3' }),
      row({ eventType: 'auth.login-succeeded', idp: 'github', eventId: '4' }),
      row({ eventType: 'auth.signup-completed', eventId: '5' }),
      row({ eventType: 'auth.invite-redeemed', eventId: '6' }),
      row({ eventType: 'auth.invite-redeemed', eventId: '7' }),
      // Out of range / wrong tenant -- must not be counted.
      row({ eventType: 'auth.login-succeeded', idp: 'google', tenant: 'other-tenant', eventId: '8' }),
      row({ eventType: 'auth.login-succeeded', idp: 'google', timestamp: '2020-01-01T00:00:00.000Z', eventId: '9' }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/auth-funnel?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z',
      headers: await bearerHeader(),
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()

    const google = body.byProvider.find((p: { idp: string }) => p.idp === 'google')
    expect(google).toEqual({ idp: 'google', succeeded: 2, failed: 1 })
    const github = body.byProvider.find((p: { idp: string }) => p.idp === 'github')
    expect(github).toEqual({ idp: 'github', succeeded: 1, failed: 0 })

    expect(body.failureReasons).toEqual([{ reason: 'token_exchange_failed', count: 1 }])

    // signups(1) / logins(3 successful) -- exactly the ratio ADR 0058 named
    // `signup-completed` to make computable.
    expect(body.signupConversion).toEqual({ signups: 1, logins: 3, rate: 1 / 3 })

    // A real, named limitation -- raw count only, never a computed rate.
    expect(body.inviteRedemptions.count).toBe(2)
    expect(typeof body.inviteRedemptions.note).toBe('string')
    expect(body.inviteRedemptions.note.length).toBeGreaterThan(0)
  })

  it('scopes to a single application when specified', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'auth.login-succeeded', idp: 'google', application: 'app1', eventId: '1' }),
      row({ eventType: 'auth.login-succeeded', idp: 'google', application: 'app2', eventId: '2' }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/auth-funnel?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z&application=app1',
      headers: await bearerHeader(),
    })

    const body = response.json()
    expect(body.byProvider).toEqual([{ idp: 'google', succeeded: 1, failed: 0 }])
  })

  it('never lets tenant be caller-supplied -- a differently-tenanted event never leaks into another tenant\'s report', async () => {
    await clickhouse.insertEvents([
      row({ eventType: 'auth.login-succeeded', idp: 'google', tenant: 'acme', eventId: '1' }),
      row({ eventType: 'auth.login-succeeded', idp: 'google', tenant: 'globex', eventId: '2' }),
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/tenants/acme/analytics/reports/auth-funnel?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z',
      headers: await bearerHeader(),
    })

    expect(response.json().byProvider).toEqual([{ idp: 'google', succeeded: 1, failed: 0 }])
  })
})
