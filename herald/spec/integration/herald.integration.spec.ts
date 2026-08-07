import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import buildApp from '../../src/lib/build-app.js'
import { buildEncryptedPayload } from '../lib/test-payload.js'
import { FakeSendAdapter } from '../lib/fake-send-adapter.js'
import { PayloadKeyring } from '../../src/lib/payload-crypto.js'
import { processCommunication } from '../../src/lib/send-worker.js'
import { uniqueSlug } from '../lib/unique.js'
import type { FastifyInstance } from 'fastify'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// Integration tier: `consequent`'s real `consequent-postgres` adapters
// against a real, disposable Postgres (testcontainers) -- proves the
// actual storage wiring works, not just the in-memory fake the behavior/
// e2e tiers use.
//
// Scoped to the central slice this pilot prioritized (communication types,
// templates, and communication history/send) -- not exhaustive re-coverage
// of every behavior-tier test against Postgres, matching tower's own
// integration tier's scope decision.
//
// *** FIXED upstream -- history kept here for context. ***
//
// `consequent.find()` was completely non-functional when backed by
// `consequent-postgres`'s real search adapter, for two compounding reasons,
// both fixed directly in the library source (not worked around here):
//
//   1. consequent/src/search.ts's `find()` checked `.length` on whatever
//      the adapter's own `find()` returned without awaiting it first.
//      That's harmless against the built-in in-memory default (genuinely
//      synchronous), but `consequent-postgres`'s real adapter necessarily
//      returns a `Promise` (a real network round trip) -- `.length` on a
//      pending Promise is `undefined`, so the truthy check always failed
//      and `find()` silently returned `[]`, every time, for every type.
//   2. `consequent-postgres`'s adapter additionally required an array of
//      OR'd criteria sets (`[{status: 'active'}]`), not the flat object
//      (`{status: 'active'}`) `consequent`'s own core API, type
//      declarations, and default in-memory adapter all actually use.
//   3. Its `find()` also returned the search table's internal system ids
//      rather than actor ids, which `manager.getOrCreate()` requires --
//      silently fetching/creating a blank actor under the wrong id even
//      once (1) and (2) were fixed.
//
// Fixed in `consequent` (search.ts's find wrapper now awaits the adapter
// result) and `consequent-postgres` (find() accepts a flat criteria object
// and translates its results back to actor ids via the id map) -- see
// those repos' own history for detail. Confirmed against this exact suite:
// all three tests below genuinely passed once the fix was linked in, so
// they're back to plain `it`.

const actorsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/actors',
)

describe('herald -- real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let app: FastifyInstance
  let consequent: ConsequentApi
  let pgAdapters: ReturnType<typeof initializePostgresAdapters>
  let payloadKeyring: PayloadKeyring
  let adapter: FakeSendAdapter

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start()
    pgAdapters = initializePostgresAdapters({ connectionString: container.getConnectionUri() })
    consequent = await initializeConsequent({
      actors: actorsPath,
      actorStore: pgAdapters.actor,
      eventStore: pgAdapters.event,
      searchAdapter: pgAdapters.search,
      logging: { level: 'none' },
    })
    payloadKeyring = new PayloadKeyring()
    adapter = new FakeSendAdapter([{ success: true, providerMessageId: 'pg-msg-1' }])
    app = await buildApp({ consequent, payloadKeyring, adapterFor: () => adapter })
  }, 60_000) // container pull + start can genuinely take a while on a cold cache

  afterAll(async () => {
    await app.close()
    // Must close the pg connection pool *before* stopping the container --
    // same finding tower's own pilot made (stopping first leaves an open
    // client connection with nowhere to go, surfacing as a noisy uncaught
    // exception even though the tests themselves already passed).
    await pgAdapters.close()
    await container.stop()
  })

  it('persists a created communication type across a fresh fetch -- proves the write actually landed in Postgres, not just in-process memory', async () => {
    const tenant = uniqueSlug('acme')
    const response = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant}/communication-types`,
      payload: { type: 'invite-sent', category: 'transactional' },
    })
    expect(response.statusCode).toBe(201)

    const fetched = await app.inject({ method: 'GET', url: `/tenants/${tenant}/communication-types/invite-sent` })
    expect(fetched.statusCode).toBe(200)
    expect(fetched.json().tenant).toBe(tenant)
  })

  it('rejects a duplicate communication type against the real store, same as the in-memory tier', async () => {
    const tenant = uniqueSlug('acme')
    await app.inject({ method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })

    const dup = await app.inject({ method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
    expect(dup.statusCode).toBe(409)
  })

  it('suppression blocks a send against the real store -- a fetch()-by-id check, not find()-based, so unaffected by the bug documented above', async () => {
    const tenant = uniqueSlug('acme')
    const contactId = uniqueSlug('contact')
    const idempotencyKey = uniqueSlug('idem')

    await app.inject({ method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
    await app.inject({
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/invite-sent/templates`,
      payload: { subjectTemplate: 'Hi', bodyTemplate: 'Body' },
    })
    await app.inject({ method: 'POST', url: `/tenants/${tenant}/suppressions`, payload: { contactId } })

    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'x@example.com', {})
    await consequent.handle(`${tenant}:${idempotencyKey}`, 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional', type: 'invite-sent',
      title: 'x', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    // The suppression check itself is a `consequent.fetch('suppression',
    // contactId)` (send-worker.ts#isBlocked) -- a direct fetch-by-id, not a
    // `find()` query -- so this passes even though template resolution
    // (below) does not. `outcome` is `'suppressed'` here specifically
    // *because* the suppression check runs before the (broken) template
    // lookup would ever be reached -- not evidence the template lookup
    // works too.
    const outcome = await processCommunication(app.sendWorkerDeps, tenant, idempotencyKey)
    expect(outcome).toBe('suppressed')
  })

  // The following three depend on `consequent.find()` against real
  // Postgres -- see the file-level comment above for the (now-fixed)
  // upstream bug that used to make them fail.

  it('lists communication types filtered by status against the real search adapter', async () => {
    const tenant = uniqueSlug('acme')
    await app.inject({ method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'active-one' } })
    await app.inject({ method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'deprecated-one' } })
    await app.inject({ method: 'DELETE', url: `/tenants/${tenant}/communication-types/deprecated-one` })

    const activeOnly = await app.inject({ method: 'GET', url: `/tenants/${tenant}/communication-types` })
    const body = activeOnly.json()
    expect(body).toHaveLength(1)
    expect(body[0].type).toBe('active-one')

    const withDeprecated = await app.inject({ method: 'GET', url: `/tenants/${tenant}/communication-types?includeDeprecated=true` })
    expect(withDeprecated.json()).toHaveLength(2)
  })

  it('creates successive template versions against the real store', async () => {
    const tenant = uniqueSlug('acme')
    await app.inject({ method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })

    const v1 = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/invite-sent/templates`,
      payload: { subjectTemplate: 'v1', bodyTemplate: 'v1 body' },
    })
    expect(v1.json().version).toBe(1)

    // `nextTenantVersion` (template-lookup.ts) uses `find()` to compute the
    // next version -- with `find()` always returning `[]`, this second
    // create also computes version 1 instead of 2.
    const v2 = await app.inject({
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/invite-sent/templates`,
      payload: { subjectTemplate: 'v2', bodyTemplate: 'v2 body' },
    })
    expect(v2.json().version).toBe(2)

    const list = await app.inject({ method: 'GET', url: `/tenants/${tenant}/communication-types/invite-sent/templates` })
    expect(list.json()).toHaveLength(2)
    expect(list.json()[0].version).toBe(2) // newest first
  })

  it('a communication created, rendered, and sent through the send worker persists correctly in Postgres', async () => {
    const tenant = uniqueSlug('acme')
    const contactId = uniqueSlug('contact')
    const idempotencyKey = uniqueSlug('idem')

    await app.inject({ method: 'POST', url: `/tenants/${tenant}/communication-types`, payload: { type: 'invite-sent' } })
    await app.inject({
      method: 'POST',
      url: `/tenants/${tenant}/communication-types/invite-sent/templates`,
      payload: { subjectTemplate: 'Hi {{name}}', bodyTemplate: 'Welcome {{name}}' },
    })

    const { encryptedPayload, payloadKeyVersion } = buildEncryptedPayload(payloadKeyring, 'pg-recipient@example.com', { name: 'Postgres' })
    await consequent.handle(`${tenant}:${idempotencyKey}`, 'communication.create', {
      idempotencyKey, tenant, application: 'app1', contactId, category: 'transactional', type: 'invite-sent',
      title: 'Invite', templateVersion: 1, encryptedPayload, payloadKeyVersion, channel: 'email',
    })

    // `resolvePinnedTemplate` (template-lookup.ts) uses `find()` to locate
    // the template -- with `find()` always returning `[]`, this currently
    // resolves to `'failed'` ("no template found"), not `'sent'`.
    const outcome = await processCommunication(app.sendWorkerDeps, tenant, idempotencyKey)
    expect(outcome).toBe('sent')

    const detail = await app.inject({ method: 'GET', url: `/tenants/${tenant}/communications/${idempotencyKey}` })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().status).toBe('sent')
    expect(detail.json().providerMessageId).toBe('pg-msg-1')
  })
})
