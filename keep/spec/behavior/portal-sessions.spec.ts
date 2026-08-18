import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import buildTestApp, { type TestApp } from '../lib/test-app.js'

// Behavior tier: design/decisions/0090-organizations-shared-billing-
// administration-and-succession.md. No customer-creation route exists in
// keep (Story 001/002 -- a `customer` record is only ever created by
// webhook handling on a completed checkout), so tests create one directly
// via `consequent.handle()`, same convention used throughout this
// codebase for actors with no direct-creation route.

describe('portal sessions -- API contract (ADR 0090)', () => {
  let t: TestApp

  beforeEach(async () => {
    t = await buildTestApp()
    await t.stripeConfig.set('acme', { secretKey: 'sk_test_acme', webhookSecret: 'whsec_acme' })
  })

  afterEach(async () => {
    await t.app.close()
  })

  async function createOrgCustomer(organizationId: string, stripeCustomerId: string) {
    await t.consequent.handle(`cust_${organizationId}`, 'customer.create', {
      id: `cust_${organizationId}`,
      tenant: 'acme',
      scope: { organization: organizationId },
      stripeCustomerId,
    })
  }

  it('creates a real portal session for an organization with an existing stripe customer', async () => {
    await createOrgCustomer('org-1', 'cus_org1')
    const headers = await t.headers({ organizationId: 'org-1', permissions: ['organization:manage'] })

    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/organizations/org-1/portal-sessions',
      headers,
      payload: { returnUrl: 'https://acme.example.com/account' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().url).toContain('billing.stripe.test')
    expect(t.stripeState.portalSessions).toHaveLength(1)
    expect(t.stripeState.portalSessions[0]).toEqual({ stripeCustomerId: 'cus_org1', returnUrl: 'https://acme.example.com/account' })
  })

  it('works for a holder of the narrower organization-billing:manage grant too', async () => {
    await createOrgCustomer('org-1', 'cus_org1')
    const headers = await t.headers({ organizationId: 'org-1', permissions: ['organization-billing:manage'] })

    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/organizations/org-1/portal-sessions',
      headers,
      payload: { returnUrl: 'https://acme.example.com/account' },
    })
    expect(response.statusCode).toBe(201)
  })

  it('returns 404 when the organization has no stripe customer yet', async () => {
    const headers = await t.headers({ organizationId: 'org-1', permissions: ['organization:manage'] })
    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/organizations/org-1/portal-sessions',
      headers,
      payload: { returnUrl: 'https://acme.example.com/account' },
    })
    expect(response.statusCode).toBe(404)
  })

  it('returns 409 when the tenant has no stripe configuration', async () => {
    // A fresh app whose beforeEach-equivalent stripeConfig.set never runs --
    // t's own beforeEach already configured 'acme', so this needs its own
    // unconfigured instance rather than reusing t.
    const unconfigured = await buildTestApp()
    await unconfigured.consequent.handle('cust_org1', 'customer.create', {
      id: 'cust_org1',
      tenant: 'acme',
      scope: { organization: 'org-1' },
      stripeCustomerId: 'cus_org1',
    })
    const headers = await unconfigured.headers({ organizationId: 'org-1', permissions: ['organization:manage'] })
    const response = await unconfigured.app.inject({
      method: 'POST',
      url: '/tenants/acme/organizations/org-1/portal-sessions',
      headers,
      payload: { returnUrl: 'https://acme.example.com/account' },
    })
    expect(response.statusCode).toBe(409)
    await unconfigured.app.close()
  })

  it('rejects 403 for a caller with neither organization grant', async () => {
    await createOrgCustomer('org-1', 'cus_org1')
    const headers = await t.headers({ organizationId: 'org-1' })
    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/organizations/org-1/portal-sessions',
      headers,
      payload: { returnUrl: 'https://acme.example.com/account' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects 403 for a grant holder whose organizationId claim is for a *different* organization', async () => {
    await createOrgCustomer('org-1', 'cus_org1')
    const headers = await t.headers({ organizationId: 'org-2', permissions: ['organization:manage'] })
    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/organizations/org-1/portal-sessions',
      headers,
      payload: { returnUrl: 'https://acme.example.com/account' },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects with 403 when no bearer token is presented', async () => {
    await createOrgCustomer('org-1', 'cus_org1')
    const response = await t.app.inject({
      method: 'POST',
      url: '/tenants/acme/organizations/org-1/portal-sessions',
      payload: { returnUrl: 'https://acme.example.com/account' },
    })
    expect(response.statusCode).toBe(403)
  })
})
