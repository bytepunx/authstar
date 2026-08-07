// A small, real HTTP server standing in for tower's (and herald's) operator
// API, faithful to the request/response shapes named in
// design/stories/tower/{010,011,012,013}.md. Used by the integration tier
// (steward's own `/api/**` layer, wired for real over the network, no
// browser) and the e2e tier (Playwright driving a real browser against a
// real steward server, which in turn calls this).
//
// Deliberately not a mock library -- plain `node:http`, so it behaves like a
// real backend (real status codes, real JSON bodies, real network round
// trip) rather than an in-process stub. Holds enough in-memory state
// (tenants, accounts) to support realistic multi-step flows (create a
// tenant, then find it in search; suspend it, then reactivate it).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeTenant {
  slug: string
  name: string
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
}

export interface FakeAccount {
  id: string
  email: string
  permissions: Array<{ application: string | null; role: string }>
}

export interface FakeBackendState {
  tenants: FakeTenant[]
  accounts: Record<string, FakeAccount[]> // keyed by tenant slug
  validToken: string
  rejectNextRotation?: boolean
}

export interface FakeBackend {
  url: string
  state: FakeBackendState
  close: () => Promise<void>
  requests: Array<{ method: string; path: string; headers: Record<string, string | undefined> }>
}

function send(res: ServerResponse, status: number, body?: unknown) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const text = Buffer.concat(chunks).toString('utf8')
  return text.length > 0 ? JSON.parse(text) : undefined
}

export async function startFakeBackend(initial?: Partial<FakeBackendState>, port = 0): Promise<FakeBackend> {
  const state: FakeBackendState = {
    tenants: initial?.tenants ?? [
      { slug: 'acme', name: 'Acme Corp', status: 'active', createdAt: new Date().toISOString() },
      { slug: 'globex', name: 'Globex', status: 'suspended', createdAt: new Date().toISOString() },
    ],
    accounts: initial?.accounts ?? {
      acme: [
        { id: 'acc-1', email: 'admin@acme.test', permissions: [{ application: null, role: 'tenant-admin' }] },
        { id: 'acc-2', email: 'nobody@acme.test', permissions: [] },
      ],
    },
    validToken: initial?.validToken ?? 'valid-operator-token',
  }

  const requests: FakeBackend['requests'] = []

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake-backend.test')
    const method = req.method ?? 'GET'
    requests.push({
      method,
      path: url.pathname,
      headers: { authorization: req.headers.authorization, 'x-operator-actor': req.headers['x-operator-actor'] as string | undefined },
    })

    const auth = req.headers.authorization ?? ''
    const token = /^Bearer (.+)$/.exec(auth)?.[1]
    if (!token || token !== state.validToken) {
      send(res, 401, { error: 'invalid or missing operator token' })
      return
    }

    try {
      // GET /operator/tenants -- search/list (Story 013)
      if (method === 'GET' && url.pathname === '/operator/tenants') {
        const search = url.searchParams.get('search')?.toLowerCase()
        const items = state.tenants.filter(
          (t) => !search || t.slug.toLowerCase().includes(search) || t.name.toLowerCase().includes(search),
        )
        send(res, 200, { items, total: items.length })
        return
      }

      // PATCH /operator/tenants/:slug -- status transition (Story 011)
      const patchMatch = /^\/operator\/tenants\/([^/]+)$/.exec(url.pathname)
      if (method === 'PATCH' && patchMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const slug = decodeURIComponent(patchMatch[1])
        const tenant = state.tenants.find((t) => t.slug === slug)
        if (!tenant) {
          send(res, 404, { error: 'not found' })
          return
        }
        const body = (await readBody(req)) as { status?: string }
        if (body.status === 'active' || body.status === 'suspended') {
          tenant.status = body.status
        }
        send(res, 200, tenant)
        return
      }

      // POST /tenants -- creation (Story 012), standalone ingress
      if (method === 'POST' && url.pathname === '/tenants') {
        const body = (await readBody(req)) as { slug: string; name: string; adminEmail: string; adminHost?: string }
        if (state.tenants.some((t) => t.slug === body.slug)) {
          send(res, 409, { error: `slug "${body.slug}" already exists`, failedStep: 'validate-slug' })
          return
        }
        state.tenants.push({ slug: body.slug, name: body.name, status: 'active', createdAt: new Date().toISOString() })
        state.accounts[body.slug] = []
        send(res, 201, { slug: body.slug, adminHost: body.adminHost ?? `admin.${body.slug}.authstar.app` })
        return
      }

      // GET /operator/tenants/:slug/accounts -- list/email-search (Story 005 via 013)
      const accountsMatch = /^\/operator\/tenants\/([^/]+)\/accounts$/.exec(url.pathname)
      if (method === 'GET' && accountsMatch) {
        const slug = decodeURIComponent(accountsMatch[1])
        const email = url.searchParams.get('email')
        const all = state.accounts[slug] ?? []
        const items = email ? all.filter((a) => a.email === email) : all
        send(res, 200, { items })
        return
      }

      // POST .../accounts/:accountId/permissions -- grant
      const grantMatch = /^\/operator\/tenants\/([^/]+)\/accounts\/([^/]+)\/permissions$/.exec(url.pathname)
      if (method === 'POST' && grantMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const [, slugRaw, accountIdRaw] = grantMatch
        const slug = decodeURIComponent(slugRaw)
        const accountId = decodeURIComponent(accountIdRaw)
        const account = (state.accounts[slug] ?? []).find((a) => a.id === accountId)
        if (!account) {
          send(res, 404, { error: 'not found' })
          return
        }
        const grant = (await readBody(req)) as { application: string | null; role: string }
        account.permissions.push(grant)
        send(res, 200, account)
        return
      }

      // DELETE .../accounts/:accountId/permissions/:grant -- revoke
      const revokeMatch = /^\/operator\/tenants\/([^/]+)\/accounts\/([^/]+)\/permissions\/([^/]+)$/.exec(url.pathname)
      if (method === 'DELETE' && revokeMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const [, slugRaw, accountIdRaw, grantRaw] = revokeMatch
        const slug = decodeURIComponent(slugRaw)
        const accountId = decodeURIComponent(accountIdRaw)
        const grantKey = decodeURIComponent(grantRaw)
        const account = (state.accounts[slug] ?? []).find((a) => a.id === accountId)
        if (account) {
          account.permissions = account.permissions.filter((p) => `${p.application ?? ''}:${p.role}` !== grantKey)
        }
        send(res, 204)
        return
      }

      // POST .../invites -- bootstrap invite
      const inviteMatch = /^\/operator\/tenants\/([^/]+)\/invites$/.exec(url.pathname)
      if (method === 'POST' && inviteMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const body = (await readBody(req)) as { email: string }
        send(res, 201, { id: 'inv-' + Math.random().toString(36).slice(2, 8), email: body.email })
        return
      }

      // POST .../rotate-keys -- tenant key rotation (Story 011)
      const rotateMatch = /^\/operator\/tenants\/([^/]+)\/rotate-keys$/.exec(url.pathname)
      if (method === 'POST' && rotateMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const body = (await readBody(req)) as { keys: string[] }
        send(res, 200, { rotated: body.keys })
        return
      }

      send(res, 404, { error: `no fake route for ${method} ${url.pathname}` })
    } catch (err) {
      send(res, 500, { error: err instanceof Error ? err.message : 'fake backend error' })
    }
  })

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${address.port}`,
    state,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  }
}
