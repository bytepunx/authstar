import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { initialize as initializePostgresAdapters } from 'consequent-postgres'
import initializeConsequent from 'consequent'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import buildApp from '../../src/lib/build-app.js'
import type { FastifyInstance } from 'fastify'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer } from '../lib/internal-jwt.js'

// Integration tier: `consequent`'s real `consequent-postgres` adapters
// against a real, disposable Postgres (testcontainers), proving the actual
// storage wiring works -- not just the in-memory fake the behavior/e2e
// tiers use. Isolated to this one service and its own direct dependency
// (Postgres) -- no other authstar service involved, per this project's
// explicit "single-service integration, multi-service is a separate
// project" scoping.

const actorsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/actors',
)

describe('tenant management -- real Postgres', () => {
  let container: StartedPostgreSqlContainer
  let app: FastifyInstance
  let consequent: ConsequentApi
  let pgAdapters: ReturnType<typeof initializePostgresAdapters>
  let headers: { authorization: string }

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
    const jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, authstarGetKey: jwt.getKey })
    headers = bearer(await jwt.signToken({ permissions: ['tenant:manage'] }))
  }, 60_000) // container pull + start can genuinely take a while on a cold cache

  afterAll(async () => {
    await app.close()
    // Must close the pg connection pool *before* stopping the container --
    // stopping first leaves an open client connection with nowhere to go,
    // surfacing as a noisy "terminating connection due to administrator
    // command" uncaught exception even though the tests themselves already
    // passed. Found by actually running this suite, not anticipated upfront.
    await pgAdapters.close()
    await container.stop()
  })

  it('persists a created tenant across a fresh fetch -- proves the write actually landed in Postgres, not just in-process memory', async () => {
    await consequent.handle('acme', 'tenant.create', {
      slug: 'acme',
      name: 'Acme',
      cookieDomain: 'acme.authstar.app',
      createdBy: 'integration-test',
    })

    const response = await app.inject({ method: 'GET', url: '/tenants/acme' })

    expect(response.statusCode).toBe(200)
    expect(response.json().name).toBe('Acme')
  })

  it('rejects an invalid status transition against the real store, same as the in-memory tier', async () => {
    await consequent.handle('acme2', 'tenant.create', {
      slug: 'acme2',
      name: 'Acme Two',
      cookieDomain: 'acme2.authstar.app',
      createdBy: 'integration-test',
    })
    await consequent.handle('acme2', 'tenant.suspend', { status: 'suspended' })

    const response = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme2',
      headers,
      payload: { status: 'suspended' },
    })

    expect(response.statusCode).toBe(409)
  })
})
