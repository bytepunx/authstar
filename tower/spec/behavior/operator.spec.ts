import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpySignetAdmin } from '../lib/fakes.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'

// Behavior tier: design/stories/tower/013-operator-api.md. Covers both
// halves of the story:
//  - The two genuinely new routes (`GET /operator/tenants`, `GET
//    /operator/erasure-requests/stuck`) -- routes/operator.ts.
//  - The "reuses the same route handlers, only auth differs, no
//    same-tenant restriction" claim for everything else -- spot-checked
//    against accounts/providers/invites (routes/accounts.ts, routes/
//    providers.ts, routes/invites.ts), including the X-Operator-Actor ->
//    event.actingAs attribution mechanism (Story 010's own read side,
//    verified here through the real activity feed rather than reaching
//    into consequent's internals directly).

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: true,
  baseDomain: 'authstar.test',
  operatorToken: 'op-secret',
  defaultProvider: { name: 'default', clientId: '', discoveryUrl: '', scope: [] },
  defaultProviderClientSecret: '',
}

const operatorHeaders = { authorization: 'Bearer op-secret' }

describe('operator API -- API contract', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let signetAdmin: ReturnType<typeof createSpySignetAdmin>

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    signetAdmin = createSpySignetAdmin()
    app = await buildApp({ consequent, signetAdmin, provisioningConfig })
  })

  afterEach(async () => {
    await app.close()
  })

  async function createTenant(slug: string, name = 'Acme') {
    await consequent.handle(slug, 'tenant.create', { slug, name, cookieDomain: `${slug}.authstar.app`, createdBy: 'test-harness' })
  }

  describe('GET /operator/tenants', () => {
    it('rejects without a valid operator bearer token', async () => {
      const response = await app.inject({ method: 'GET', url: '/operator/tenants' })
      expect(response.statusCode).toBe(403)
    })

    it('lists tenants across every status, searchable by slug/name substring', async () => {
      await createTenant('acme', 'Acme Corp')
      await createTenant('globex', 'Globex Inc')
      await consequent.handle('suspended-co', 'tenant.create', { slug: 'suspended-co', name: 'Suspended Co', cookieDomain: 'x.test', createdBy: 't' })
      await consequent.handle('suspended-co', 'tenant.suspend', {})

      const all = await app.inject({ method: 'GET', url: '/operator/tenants', headers: operatorHeaders })
      expect(all.statusCode).toBe(200)
      const allBody = all.json()
      expect(allBody.data.map((t: { slug: string }) => t.slug).sort()).toEqual(['acme', 'globex', 'suspended-co'])
      const suspendedEntry = allBody.data.find((t: { slug: string }) => t.slug === 'suspended-co')
      expect(suspendedEntry.status).toBe('suspended')

      const searched = await app.inject({ method: 'GET', url: '/operator/tenants?q=glob', headers: operatorHeaders })
      expect(searched.json().data.map((t: { slug: string }) => t.slug)).toEqual(['globex'])

      const byName = await app.inject({ method: 'GET', url: '/operator/tenants?q=Acme%20Corp', headers: operatorHeaders })
      expect(byName.json().data.map((t: { slug: string }) => t.slug)).toEqual(['acme'])

      const byStatus = await app.inject({ method: 'GET', url: '/operator/tenants?status=suspended', headers: operatorHeaders })
      expect(byStatus.json().data.map((t: { slug: string }) => t.slug)).toEqual(['suspended-co'])
    })

    it('paginates via cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await createTenant(`tenant-${i}`, `Tenant ${i}`)
      }
      const page1 = await app.inject({ method: 'GET', url: '/operator/tenants?limit=2', headers: operatorHeaders })
      const body1 = page1.json()
      expect(body1.data).toHaveLength(2)
      expect(body1.nextCursor).toBeTruthy()

      const page2 = await app.inject({ method: 'GET', url: `/operator/tenants?limit=2&cursor=${body1.nextCursor}`, headers: operatorHeaders })
      const body2 = page2.json()
      expect(body2.data).toHaveLength(2)

      const page3 = await app.inject({ method: 'GET', url: `/operator/tenants?limit=2&cursor=${body2.nextCursor}`, headers: operatorHeaders })
      const body3 = page3.json()
      expect(body3.data).toHaveLength(1)
      expect(body3.nextCursor).toBeNull()

      const allSlugs = [...body1.data, ...body2.data, ...body3.data].map((t: { slug: string }) => t.slug)
      expect(new Set(allSlugs).size).toBe(5)
    })
  })

  describe('GET /operator/erasure-requests/stuck', () => {
    it('rejects without a valid operator bearer token', async () => {
      const response = await app.inject({ method: 'GET', url: '/operator/erasure-requests/stuck' })
      expect(response.statusCode).toBe(403)
    })

    it('surfaces only pending requests older than the threshold, with per-service outstanding detail', async () => {
      await consequent.handle('contact-old', 'erasureRequest.create', { tenant: 'acme', contactId: 'contact-old', accountId: 'acct-1' })
      await consequent.handle('contact-old', 'erasureRequest.acknowledge', { service: 'herald' })
      await consequent.handle('contact-recent', 'erasureRequest.create', { tenant: 'globex', contactId: 'contact-recent', accountId: 'acct-2' })

      // Both requests were "requested" at roughly now (real event
      // timestamps, no way to backdate through the public API) -- assert
      // the `olderThanHours=0` case surfaces both, and a very large
      // threshold surfaces neither, rather than trying to fabricate an
      // artificially-old request.
      const stuck = await app.inject({ method: 'GET', url: '/operator/erasure-requests/stuck?olderThanHours=0', headers: operatorHeaders })
      expect(stuck.statusCode).toBe(200)
      const body = stuck.json() as Array<{ tenant: string, contactId: string, outstandingServices: string[] }>
      expect(body.map((r) => r.contactId).sort()).toEqual(['contact-old', 'contact-recent'])

      const oldEntry = body.find((r) => r.contactId === 'contact-old')!
      expect(oldEntry.tenant).toBe('acme')
      expect(oldEntry.outstandingServices).toEqual(['keep']) // herald already acknowledged

      const recentEntry = body.find((r) => r.contactId === 'contact-recent')!
      expect(recentEntry.outstandingServices.sort()).toEqual(['herald', 'keep'])

      const notStuck = await app.inject({ method: 'GET', url: '/operator/erasure-requests/stuck?olderThanHours=999999', headers: operatorHeaders })
      expect(notStuck.json()).toEqual([])
    })

    it('excludes completed requests', async () => {
      await consequent.handle('contact-done', 'erasureRequest.create', { tenant: 'acme', contactId: 'contact-done', accountId: 'acct-1' })
      await consequent.handle('contact-done', 'erasureRequest.acknowledge', { service: 'herald' })
      await consequent.handle('contact-done', 'erasureRequest.acknowledge', { service: 'keep' })

      const response = await app.inject({ method: 'GET', url: '/operator/erasure-requests/stuck?olderThanHours=0', headers: operatorHeaders })
      expect(response.json()).toEqual([])
    })
  })

  describe('operator reuse of tenant-scoped handlers (accounts)', () => {
    it('rejects a mutating request without X-Operator-Actor (400), read-only requests need no header', async () => {
      await createTenant('acme')
      await consequent.handle('acct-1', 'account.create', { accountId: 'acct-1', tenant: 'acme', contactId: 'c-1' })

      const read = await app.inject({ method: 'GET', url: '/operator/tenants/acme/accounts', headers: operatorHeaders })
      expect(read.statusCode).toBe(200)

      const mutateWithoutActor = await app.inject({
        method: 'PATCH', url: '/operator/tenants/acme/accounts/acct-1', headers: operatorHeaders, payload: { status: 'suspended' },
      })
      expect(mutateWithoutActor.statusCode).toBe(400)
    })

    it('grants a role with no permissions:manage-style JWT at all, across any tenant, attributing the event via X-Operator-Actor', async () => {
      await createTenant('acme')
      await consequent.handle('acme:admin', 'roleDefinition.create', { tenant: 'acme', name: 'admin', scope: 'tenant', description: '' })
      await consequent.handle('acct-1', 'account.create', { accountId: 'acct-1', tenant: 'acme', contactId: 'c-1' })

      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/accounts/acct-1/roles',
        headers: { ...operatorHeaders, 'x-operator-actor': 'steward-alice' },
        payload: { name: 'admin', scope: 'tenant' },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().grantedRoles).toEqual([{ name: 'admin', scope: 'tenant' }])

      // The event this write produced carries the attribution durably --
      // verified through the real activity feed (Story 010's own read
      // side), not by reaching into consequent's storage directly.
      const activity = await app.inject({ method: 'GET', url: '/operator/tenants/acme/activity', headers: operatorHeaders })
      const entries = activity.json().data as Array<{ eventType: string, actingAs: string | null }>
      const roleGrantEntry = entries.find((e) => e.eventType === 'account.role-granted')
      expect(roleGrantEntry?.actingAs).toBe('steward-alice')
    })

    it('a tenant-scoped call to the exact same handler never carries actingAs', async () => {
      await createTenant('acme')
      await consequent.handle('acme:admin', 'roleDefinition.create', { tenant: 'acme', name: 'admin', scope: 'tenant', description: '' })
      await consequent.handle('acct-1', 'account.create', { accountId: 'acct-1', tenant: 'acme', contactId: 'c-1' })

      // Reuse the tenant-scoped path directly against consequent, since
      // this spec file has no JWT fixture wired -- the point under test is
      // the actor-level event shape, not the tenant-scoped route's own
      // auth (already covered by accounts-management.spec.ts).
      await consequent.handle('acct-1', 'account.grant-role', { role: { name: 'admin', scope: 'tenant' } })

      const activity = await app.inject({ method: 'GET', url: '/operator/tenants/acme/activity', headers: operatorHeaders })
      const entries = activity.json().data as Array<{ eventType: string, actingAs: string | null }>
      const roleGrantEntry = entries.find((e) => e.eventType === 'account.role-granted')
      expect(roleGrantEntry?.actingAs).toBeNull()
    })
  })

  describe('operator reuse of tenant-scoped handlers (providers)', () => {
    it('creates a provider via the operator tree, attributing via X-Operator-Actor, pushing the secret the same way', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/providers',
        headers: { ...operatorHeaders, 'x-operator-actor': 'steward-bob' },
        payload: { name: 'dex', discoveryUrl: 'https://dex/.well-known', clientId: 'c1', clientSecret: 'sekret' },
      })
      expect(response.statusCode).toBe(201)
      expect(signetAdmin.calls).toHaveLength(1)
      expect(signetAdmin.calls[0].key).toBe('tenant-acme-provider-dex-client-secret')

      const activity = await app.inject({ method: 'GET', url: '/operator/tenants/acme/activity', headers: operatorHeaders })
      const entries = activity.json().data as Array<{ eventType: string, actingAs: string | null }>
      expect(entries.find((e) => e.eventType === 'provider.created')?.actingAs).toBe('steward-bob')
    })
  })

  describe('operator reuse of tenant-scoped handlers (invites)', () => {
    it('issues an invite via the operator tree -- the ADR 0021 "bootstrap path" for admin access', async () => {
      await createTenant('acme')

      const response = await app.inject({
        method: 'POST',
        url: '/operator/tenants/acme/invites',
        headers: { ...operatorHeaders, 'x-operator-actor': 'steward-carol' },
        payload: { contactId: 'c-1', permissions: [{ grant: 'accounts:manage', scope: 'tenant', maxOutstanding: null }] },
      })
      expect(response.statusCode).toBe(201)
      expect(response.json().permissions).toEqual([{ grant: 'accounts:manage', scope: 'tenant', maxOutstanding: null }])

      const activity = await app.inject({ method: 'GET', url: '/operator/tenants/acme/activity', headers: operatorHeaders })
      const entries = activity.json().data as Array<{ eventType: string, actingAs: string | null }>
      expect(entries.find((e) => e.eventType === 'invite.created')?.actingAs).toBe('steward-carol')
    })
  })
})
