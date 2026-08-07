import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'

// End-to-end tier: a full, realistic lifecycle exercised entirely through
// the HTTP surface (no direct `consequent.handle()` calls except for
// creation, which has no route in this pilot slice yet -- tower Story 012
// covers real tenant provisioning, not implemented here). Still no external
// dependencies -- same in-memory `consequent` adapters as the behavior
// tier, but this tier cares about the *sequence* of calls a real operator
// session would make, not any one call's contract in isolation.

describe('tenant lifecycle -- settings edits, then suspension, end to end', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    app = await buildApp({ consequent })
    // No POST /tenants route in this pilot slice (tower Story 012's
    // provisioning sequence is a separate, larger story) -- creation goes
    // straight through consequent, exactly as it would from any other
    // internal caller.
    await consequent.handle('acme', 'tenant.create', {
      slug: 'acme',
      name: 'Acme',
      cookieDomain: 'acme.authstar.app',
      createdBy: 'e2e-test',
    })
  })

  afterEach(async () => {
    await app.close()
  })

  it('walks name edit -> cookie edit -> suspend -> rejected re-suspend -> final state, all via HTTP', async () => {
    const rename = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme',
      payload: { name: 'Acme Corporation' },
    })
    expect(rename.statusCode).toBe(200)

    const cookieEdit = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme',
      payload: { cookie: { maxAge: 1_209_600, secure: true } },
    })
    expect(cookieEdit.statusCode).toBe(200)
    expect(cookieEdit.json().cookie.maxAge).toBe(1_209_600)

    const suspend = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme',
      payload: { status: 'suspended' },
    })
    expect(suspend.statusCode).toBe(200)
    expect(suspend.json().status).toBe('suspended')

    // A second suspend attempt on an already-suspended tenant is rejected,
    // not a silent no-op -- Story 011's own acceptance criteria, exercised
    // here as part of a realistic sequence rather than in isolation.
    const reSuspend = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme',
      payload: { status: 'suspended' },
    })
    expect(reSuspend.statusCode).toBe(409)

    // A name edit against an already-suspended tenant still succeeds --
    // this route has no awareness of portcullis's own suspension
    // enforcement (Story 013's gate); tower's own PATCH route was never
    // designed to additionally block writes to a suspended tenant's other
    // fields, only to restrict which status transitions are reachable.
    const renameWhileSuspended = await app.inject({
      method: 'PATCH',
      url: '/tenants/acme',
      payload: { name: 'Acme Corp (Suspended)' },
    })
    expect(renameWhileSuspended.statusCode).toBe(200)

    const final = await app.inject({ method: 'GET', url: '/tenants/acme' })
    const body = final.json()
    expect(body.name).toBe('Acme Corp (Suspended)')
    expect(body.status).toBe('suspended')
    expect(body.cookie.maxAge).toBe(1_209_600)
  })
})
