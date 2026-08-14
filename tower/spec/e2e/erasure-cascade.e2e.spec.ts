import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import buildApp from '../../src/lib/build-app.js'
import buildInMemoryConsequent from '../lib/in-memory-consequent.js'
import { createSpyPublisher } from '../lib/fakes.js'
import { startErasureAckConsumer, type ChannelLike, type ConsumedMessage } from '../../src/lib/erasure-ack-consumer.js'
import type { ConsequentApi } from '../../src/lib/consequent-types.js'
import { createInternalJwtFixture, bearer } from '../lib/internal-jwt.js'

// End-to-end tier: tower's producer/tracking role in the erasure cascade
// (ADR 0026) -- a real person signs up (identity resolution creates
// account+contact), a caller requests erasure (contact hard-deleted,
// `erasureRequest` created, `contact.purged` published), and each
// subscriber's acknowledgement (simulated the same way the entitlement
// e2e test simulates keep's publish -- a fake RabbitMQ channel) converges
// the request to `completed`.

function fakeChannel() {
  let onMessage: ((msg: ConsumedMessage | null) => void) | undefined
  const channel: ChannelLike = {
    async consume(_queue, cb) { onMessage = cb; return {} },
    ack() {},
    nack() {},
  }
  function deliver(payload: unknown) {
    onMessage!({ content: Buffer.from(JSON.stringify(payload), 'utf8'), fields: { routingKey: 'contact.purge.acknowledged' } })
  }
  return { channel, deliver }
}
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('erasure cascade -- signup, erasure request, downstream acknowledgements, end to end', () => {
  let app: FastifyInstance
  let consequent: ConsequentApi
  let publisher: ReturnType<typeof createSpyPublisher>
  let eraseHeaders: { authorization: string }
  let erasureReadHeaders: { authorization: string }

  beforeEach(async () => {
    consequent = await buildInMemoryConsequent()
    publisher = createSpyPublisher()
    const jwt = await createInternalJwtFixture()
    app = await buildApp({ consequent, publisher, authstarGetKey: jwt.getKey })
    eraseHeaders = bearer(await jwt.signToken({ permissions: ['contacts:erase'] }))
    erasureReadHeaders = bearer(await jwt.signToken({ permissions: ['erasure-requests:read'] }))
  })

  afterEach(async () => {
    await app.close()
  })

  it('walks signup -> erasure request -> herald ack -> keep ack -> completed', async () => {
    const resolve = await app.inject({
      method: 'POST',
      url: '/identities/resolve',
      payload: { tenant: 'acme', idp: 'dex', identityHashes: ['hash-1'], email: 'person@acme.test' },
    })
    const { accountId } = resolve.json()

    const contact = await app.contactStore.findByEmail('acme', 'person@acme.test')
    expect(contact).not.toBeNull()

    const erase = await app.inject({ method: 'DELETE', url: `/tenants/acme/contacts/${contact!.id}`, headers: eraseHeaders })
    expect(erase.statusCode).toBe(202)
    expect(publisher.calls[0].payload).toEqual({ tenant: 'acme', contactId: contact!.id, accountId })

    let status = await app.inject({ method: 'GET', url: `/tenants/acme/erasure-requests/${contact!.id}`, headers: erasureReadHeaders })
    expect(status.json().status).toBe('pending')

    const { channel, deliver } = fakeChannel()
    await startErasureAckConsumer(channel, 'q', { consequent })
    deliver({ tenant: 'acme', contactId: contact!.id, service: 'herald' })
    await flush()

    status = await app.inject({ method: 'GET', url: `/tenants/acme/erasure-requests/${contact!.id}`, headers: erasureReadHeaders })
    expect(status.json().status).toBe('pending')
    expect(status.json().acknowledgedBy).toEqual(['herald'])

    deliver({ tenant: 'acme', contactId: contact!.id, service: 'keep' })
    await flush()

    status = await app.inject({ method: 'GET', url: `/tenants/acme/erasure-requests/${contact!.id}`, headers: erasureReadHeaders })
    expect(status.json().status).toBe('completed')

    // The account itself is untouched -- still resolvable, contactId now dangles.
    const account = await consequent.fetch('account', accountId)
    expect(account!.state.status).toBe('active')
    expect(account!.state.contactId).toBe(contact!.id)
  })
})
