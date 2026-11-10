import { describe, expect, it } from 'vitest'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { findTenantScopedRecords, tenantsWithStripeConfig } from '../../src/report-tenant-scope.js'

// Behavior tier for ADR 0109's one-off report. Tests the run-once core
// (`findTenantScopedRecords`) against in-memory consequent; the standalone
// entrypoint that runs it against real signet/Postgres has no test of its
// own, as for `src/sync-pricing.ts` (see TESTING.md).

describe('tenant-scope report (ADR 0109)', () => {
  it('lists the record with a tenant scope, not the account-scoped one, and changes neither', async () => {
    const consequent = await buildInMemoryConsequent()
    await consequent.handle('cust_tenant', 'customer.create', { id: 'cust_tenant', tenant: 'acme', scope: { tenant: 'acme' }, stripeCustomerId: 'cus_tenant' })
    await consequent.handle('cust_account', 'customer.create', { id: 'cust_account', tenant: 'acme', scope: { account: 'acct_1' }, stripeCustomerId: 'cus_account' })
    // The record fields keep wrote; consequent's own bookkeeping on a fetch is left out.
    const read = () => Promise.all(['cust_tenant', 'cust_account'].map(async (id) => {
      const { tenant, scope, stripeCustomerId } = (await consequent.fetch('customer', id))!.state as Record<string, unknown>
      return { id, tenant, scope, stripeCustomerId }
    }))
    const before = await read()

    const records = await findTenantScopedRecords(consequent, ['acme'])

    expect(records).toEqual([{ type: 'customer', id: 'cust_tenant', tenant: 'acme', scope: { tenant: 'acme' } }])
    const after = await read()
    expect(after).toEqual(before)
    expect(after).toEqual([
      { id: 'cust_tenant', tenant: 'acme', scope: { tenant: 'acme' }, stripeCustomerId: 'cus_tenant' },
      { id: 'cust_account', tenant: 'acme', scope: { account: 'acct_1' }, stripeCustomerId: 'cus_account' },
    ])
  })

  it('lists tenant-scoped subscriptions, trials, disputes, and refunds too, by their own ids', async () => {
    const consequent = await buildInMemoryConsequent()
    const scope = { tenant: 'acme' }
    await consequent.handle('sub_1', 'subscription.create', { stripeSubscriptionId: 'sub_1', tenant: 'acme', scope, stripePriceId: 'price_basic', status: 'active', currentPeriodEnd: '2026-12-31T00:00:00.000Z' })
    await consequent.handle('trial_1', 'trial.create', { id: 'trial_1', tenant: 'acme', scope, grantedRoles: [], seatLimit: null, expiresAt: '2026-12-31T00:00:00.000Z' })
    await consequent.handle('dp_1', 'dispute.create', { stripeDisputeId: 'dp_1', tenant: 'acme', scope, stripeChargeId: 'ch_1', amount: 100, currency: 'usd', reason: 'fraudulent' })
    await consequent.handle('re_1', 'refund.create', { stripeRefundId: 're_1', tenant: 'acme', scope, stripeChargeId: 'ch_1', amount: 100, currency: 'usd', reason: '', refundedAt: '2026-11-01T00:00:00.000Z' })

    const records = await findTenantScopedRecords(consequent, ['acme'])

    expect(records.map((r) => `${r.type}:${r.id}`).sort()).toEqual(['dispute:dp_1', 'refund:re_1', 'subscription:sub_1', 'trial:trial_1'])
  })

  it('scans only the tenants it is given, each once', async () => {
    const consequent = await buildInMemoryConsequent()
    await consequent.handle('cust_globex', 'customer.create', { id: 'cust_globex', tenant: 'globex', scope: { tenant: 'globex' }, stripeCustomerId: 'cus_globex' })

    expect(await findTenantScopedRecords(consequent, ['acme'])).toEqual([])
    expect(await findTenantScopedRecords(consequent, ['globex', 'globex'])).toHaveLength(1)
  })

  it('finds the tenants with a Stripe configuration in keep bundle secrets', () => {
    expect(tenantsWithStripeConfig({
      'stripe-secret-key-acme': 'sk_test_acme',
      'stripe-webhook-secret-acme': 'whsec_acme',
      'stripe-secret-key-globex': 'sk_test_globex',
      dbConnectionString: 'postgres://',
    })).toEqual(['acme', 'globex'])
  })
})
