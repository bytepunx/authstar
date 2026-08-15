import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import buildApp from '../../src/lib/build-app.js'
import { createPgContactStore, ensureContactsSchema } from '../../src/lib/contact-store.js'
import { createSpyPublisher, createSpySignetAdmin } from '../lib/fakes.js'
import type { FastifyInstance } from 'fastify'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import type { ProvisioningConfig } from '../../src/routes/provisioning.js'
import { createInternalJwtFixture, bearer } from '../lib/internal-jwt.js'

// Integration tier: the new actors (application/provider/account/identity/
// invite/erasureRequest) plus `ContactStore`'s real Postgres implementation
// against a real, disposable Postgres (testcontainers) -- same template as
// the existing `tenants.integration.spec.ts`. `signetAdmin`/`publisher`
// stay fakes here (real signet/RabbitMQ wiring is exercised only by
// `src/server.ts`, not live-validated in this pass -- see TESTING.md); this
// tier's job is proving the *storage* wiring (consequent-postgres actors +
// the hand-rolled `contacts` table) works, not external I/O.

const actorsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../dist/actors')

const provisioningConfig: ProvisioningConfig = {
  selfServiceEnabled: true,
  baseDomain: 'authstar.test',
  operatorToken: '',
  defaultProvider: { name: 'dex', clientId: 'c1', discoveryUrl: 'https://dex/.well-known', scope: ['openid'] },
  defaultProviderClientSecret: 'secret',
}

describe('provisioning + contacts -- real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let app: FastifyInstance
  let consequent: ConsequentApi
  let pgAdapters: ReturnType<typeof initializePostgresAdapters>
  let pool: Pool
  let eraseHeaders: { authorization: string }
  let activityHeaders: { authorization: string }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start()
    const connectionString = container.getConnectionUri()
    pool = new Pool({ connectionString })
    await ensureContactsSchema(pool)

    pgAdapters = initializePostgresAdapters({ connectionString })
    consequent = await initializeConsequent({
      actors: actorsPath,
      actorStore: pgAdapters.actor,
      eventStore: pgAdapters.event,
      searchAdapter: pgAdapters.search,
      logging: { level: 'none' },
    })

    const jwt = await createInternalJwtFixture()
    app = await buildApp({
      consequent,
      contactStore: createPgContactStore(pool, 'integration-test-pepper'),
      signetAdmin: createSpySignetAdmin(),
      publisher: createSpyPublisher(),
      provisioningConfig,
      authstarGetKey: jwt.getKey,
    })
    eraseHeaders = bearer(await jwt.signToken({ permissions: ['contacts:erase'] }))
    activityHeaders = bearer(await jwt.signToken({ permissions: ['activity:read'] }))
  }, 60_000)

  afterAll(async () => {
    await app.close()
    // Same ordering requirement `tenants.integration.spec.ts` documents:
    // close consequent-postgres's pool before stopping the container, and
    // separately end this test's own direct `pg.Pool` too.
    await pgAdapters.close()
    await pool.end()
    await container.stop()
  })

  it('persists a contact across a fresh lookup -- proves the hand-rolled contacts table actually landed in Postgres', async () => {
    const created = await app.contactStore.upsert('acme', 'Person@Acme.test', 'Person')
    const found = await app.contactStore.findByEmail('acme', 'person@acme.test')
    expect(found?.id).toBe(created.id)
    expect(found?.email).toBe('person@acme.test') // normalized on write
  })

  it('runs the full POST /tenants provisioning sequence against real Postgres-backed actors', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tenants',
      payload: { slug: 'acme-pg', name: 'Acme PG', adminEmail: 'admin@acme-pg.test' },
    })
    expect(response.statusCode).toBe(201)

    const tenant = await consequent.fetch('tenant', 'acme-pg')
    expect(tenant?.state.createdAt).toBeTruthy()
    expect(tenant?.state.secretsProvisioned).toBe(true)

    const adminApp = await consequent.fetch('application', 'acme-pg:_admin')
    expect(adminApp?.state.slug).toBe('_admin')

    const provider = await consequent.fetch('provider', 'acme-pg:dex')
    expect(provider?.state.name).toBe('dex')
  })

  it('walks identity resolution -> enrich against real Postgres-backed account/identity actors', async () => {
    const resolve = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: { tenant: 'acme-pg', idp: 'dex', identityHashes: ['pg-hash-1'], email: 'user@acme-pg.test' },
    })
    expect(resolve.statusCode).toBe(200)
    const { accountId } = resolve.json()

    await consequent.handle(accountId, 'account.grant-role', { role: { name: 'member', scope: 'tenant' } })

    const enrich = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme-pg', idp: 'dex', identityHash: 'pg-hash-1', email: '', application: '_admin' },
    })
    expect(enrich.statusCode).toBe(200)
    expect(enrich.json().grantedRoles).toEqual(['member'])
  })

  it('resolves a full-length 64-character hex identityHash against real Postgres -- the exact shape that used to overflow consequent-postgres\'s character(42) id-map column when identityHash was the actor\'s own id', async () => {
    // ADR 0027: `identityHash = HMAC-SHA256(...)`, a raw hex digest -- always
    // 64 characters. Computed the same way here to prove this isn't a
    // hand-picked short string that happens to fit.
    const fullLengthHash = createHmac('sha256', 'identity-hash-key').update('acme-pg:dex:some-idp-sub').digest('hex')
    expect(fullLengthHash).toHaveLength(64)

    const resolve = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: { tenant: 'acme-pg', idp: 'dex', identityHashes: [fullLengthHash], email: 'full-hash@acme-pg.test' },
    })
    expect(resolve.statusCode).toBe(200)
    const { accountId, isNewAccount } = resolve.json()
    expect(isNewAccount).toBe(true)

    const enrich = await app.inject({
      method: 'POST',
      url: '/enrich',
      payload: { tenant: 'acme-pg', idp: 'dex', identityHash: fullLengthHash, email: '', application: '_admin' },
    })
    expect(enrich.statusCode).toBe(200)
    expect(enrich.json().accountId).toBe(accountId)
  })

  it('erasure: real DELETE of the contact row, plus an erasureRequest actor persisted to Postgres', async () => {
    const contact = await app.contactStore.upsert('acme-pg', 'erase-me@acme-pg.test')
    const response = await app.inject({ method: 'DELETE', url: `/tenants/acme-pg/contacts/${contact.id}`, headers: eraseHeaders })
    expect(response.statusCode).toBe(202)

    const gone = await app.contactStore.findById(contact.id)
    expect(gone).toBeNull()

    const erasureRequest = await consequent.fetch('erasureRequest', contact.id)
    expect(erasureRequest?.state.status).toBe('pending')
  })

  // Story 010: proves the real merged multi-actor-type getEventStream path
  // (tenant/application/provider/account events, discovered via a real
  // consequent-postgres find() per type, all merged/sorted in one
  // getEventStream({ actors: {...} }) call) against real Postgres, not
  // just the in-memory adapter -- exactly the tier every earlier fix in
  // this pass (streamBuilder.ts's manager.models shape, the unawaited
  // fetchStream, the missing actorType arg) only ever surfaced against.
  // Reuses `acme-pg`'s state already built up by the tests above
  // (provisioning's application/provider, the enrich tests' two accounts,
  // one role grant) rather than provisioning a fresh tenant.
  it('merges activity across actor types for a real Postgres-backed tenant', async () => {
    const response = await app.inject({ method: 'GET', url: '/tenants/acme-pg/activity', headers: activityHeaders })
    expect(response.statusCode).toBe(200)

    const body = response.json() as { data: Array<{ actorType: string, eventType: string, summary: string }>, nextCursor: string | null }
    const eventTypes = body.data.map((e) => e.eventType)
    expect(eventTypes).toContain('application.created')
    expect(eventTypes).toContain('provider.created')
    expect(eventTypes).toContain('account.created')
    expect(eventTypes).toContain('account.role-granted')

    const roleGrant = body.data.find((e) => e.eventType === 'account.role-granted')
    expect(roleGrant?.summary).toBe("Role 'member' granted (tenant-wide)")
  })
})
