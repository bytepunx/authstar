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
  domain: string
  status: 'active' | 'suspended' | 'deleted'
  createdAt: string
}

export interface FakePermissionGrant {
  grant: string
  scope: 'tenant' | { application: string }
  maxOutstanding: number | null
}

export interface FakeAccount {
  id: string
  email: string
  permissions: FakePermissionGrant[]
}

export interface FakeRoleDefinition {
  tenant: string
  name: string
  scope: 'tenant' | { application: string }
  description: string
  status: 'active' | 'retired'
  createdAt: string
}

export interface FakeBackendState {
  tenants: FakeTenant[]
  accounts: Record<string, FakeAccount[]> // keyed by tenant slug
  roleDefinitions: Record<string, FakeRoleDefinition[]> // keyed by tenant slug
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
      { slug: 'acme', name: 'Acme Corp', domain: 'acme.test', status: 'active', createdAt: new Date().toISOString() },
      { slug: 'globex', name: 'Globex', domain: 'globex.test', status: 'suspended', createdAt: new Date().toISOString() },
    ],
    accounts: initial?.accounts ?? {
      acme: [
        { id: 'acc-1', email: 'admin@acme.test', permissions: [{ grant: 'tenant:manage', scope: 'tenant', maxOutstanding: null }] },
        { id: 'acc-2', email: 'nobody@acme.test', permissions: [] },
      ],
    },
    roleDefinitions: initial?.roleDefinitions ?? { acme: [] },
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
        // Real tower shape (src/routes/operator.ts): cursor pagination
        // (data/nextCursor), not items/total -- see TenantListResponse's
        // own comment in src/lib/types.ts for the bug this used to hide.
        send(res, 200, { data: items, nextCursor: null })
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
        const body = (await readBody(req)) as { slug: string; name: string; domain: string; adminEmail: string }
        if (state.tenants.some((t) => t.slug === body.slug)) {
          send(res, 409, { error: `slug "${body.slug}" already exists`, failedStep: 'validate-slug' })
          return
        }
        // ADR 0091: domain must be globally unique across tenants.
        if (state.tenants.some((t) => t.domain === body.domain)) {
          send(res, 409, { error: `domain "${body.domain}" is already registered to another tenant` })
          return
        }
        state.tenants.push({ slug: body.slug, name: body.name, domain: body.domain, status: 'active', createdAt: new Date().toISOString() })
        state.accounts[body.slug] = []
        send(res, 201, { slug: body.slug, domain: body.domain, adminHost: `authstar.${body.domain}` })
        return
      }

      // GET /tenants/:slug -- single-tenant detail (ADR 0091), tower's own
      // direct route, not the operator tree.
      const tenantDetailMatch = /^\/tenants\/([^/]+)$/.exec(url.pathname)
      if (method === 'GET' && tenantDetailMatch) {
        const slug = decodeURIComponent(tenantDetailMatch[1])
        const tenant = state.tenants.find((t) => t.slug === slug)
        if (!tenant) {
          send(res, 404, { error: 'not found' })
          return
        }
        send(res, 200, tenant)
        return
      }

      // GET /operator/tenants/:slug/accounts -- list/email-search (Story 005 via 013)
      const accountsMatch = /^\/operator\/tenants\/([^/]+)\/accounts$/.exec(url.pathname)
      if (method === 'GET' && accountsMatch) {
        const slug = decodeURIComponent(accountsMatch[1])
        const email = url.searchParams.get('email')
        const all = state.accounts[slug] ?? []
        const items = email ? all.filter((a) => a.email === email) : all
        // Real tower shape (src/routes/accounts.ts): a bare array, no
        // wrapper -- see AccountListResponse's own comment in
        // src/lib/types.ts.
        send(res, 200, items)
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
        // Real tower shape (routes/accounts.ts's permissionBodySchema):
        // {grant, scope, maxOutstanding} -- not {application, role}.
        const grant = (await readBody(req)) as FakePermissionGrant
        account.permissions.push(grant)
        send(res, 200, account)
        return
      }

      // DELETE .../accounts/:accountId/permissions/:grant -- revoke.
      // Real tower shape: the grant string is the URL param; scope comes
      // from the query string (`?scope=tenant` or `?applicationScope=`),
      // not encoded into the param itself (routes/accounts.ts's
      // removalQuerySchema).
      const revokeMatch = /^\/operator\/tenants\/([^/]+)\/accounts\/([^/]+)\/permissions\/([^/]+)$/.exec(url.pathname)
      if (method === 'DELETE' && revokeMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const [, slugRaw, accountIdRaw, grantRaw] = revokeMatch
        const slug = decodeURIComponent(slugRaw)
        const accountId = decodeURIComponent(accountIdRaw)
        const grantName = decodeURIComponent(grantRaw)
        const applicationScope = url.searchParams.get('applicationScope')
        const account = (state.accounts[slug] ?? []).find((a) => a.id === accountId)
        if (account) {
          account.permissions = account.permissions.filter((p) => {
            if (p.grant !== grantName) return true
            const pApplication = typeof p.scope === 'object' ? p.scope.application : null
            return pApplication !== applicationScope
          })
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
        const body = (await readBody(req)) as { email: string; application?: unknown }
        // Mirrors tower's real createBodySchema (routes/invites.ts): `application`
        // is a plain optional `string`, never nullable -- a tenant-wide invite
        // omits the field entirely rather than sending `null`. Steward's own
        // "Invite an admin" form used to send `application: null` explicitly,
        // which tower's real AJV validation rejects with a 400 ("must NOT have
        // fewer than 1 characters"); this fake used to accept it silently,
        // so e2e coverage never caught the bug.
        if ('application' in body && body.application !== undefined && (typeof body.application !== 'string' || body.application.length < 1)) {
          send(res, 400, { error: 'body/application must NOT have fewer than 1 characters' })
          return
        }
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
        // Real tower response shape (src/routes/rotate-keys.ts): rotated is an
        // array of { key, version, effectiveFrom } objects, not bare key
        // strings -- this fake used to send back `body.keys` directly, which
        // silently rendered as empty strings in the UI's `r.key` access
        // (RotatedKeyGeneration.key), confirmed live: the operator-console
        // e2e test's "Rotated: session, identity-hash" assertion never
        // matched because every `.key` read undefined.
        const body = (await readBody(req)) as { keys: string[] }
        send(res, 200, {
          rotated: body.keys.map((key) => ({ key, version: 2, effectiveFrom: new Date().toISOString() })),
          failed: [],
        })
        return
      }

      // GET/POST .../role-definitions -- role definition catalog
      // (authstar-steward#1). Real tower shape (routes/role-definitions.ts):
      // list is a bare array; create/retire return one definition object,
      // never wrapped.
      const roleDefsMatch = /^\/operator\/tenants\/([^/]+)\/role-definitions$/.exec(url.pathname)
      if (method === 'GET' && roleDefsMatch) {
        const slug = decodeURIComponent(roleDefsMatch[1])
        send(res, 200, state.roleDefinitions[slug] ?? [])
        return
      }
      if (method === 'POST' && roleDefsMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const slug = decodeURIComponent(roleDefsMatch[1])
        const body = (await readBody(req)) as { name: string; scope: 'tenant' | { application: string }; description?: string }
        const existing = state.roleDefinitions[slug] ?? []
        const dup = existing.some((d) => d.name === body.name && JSON.stringify(d.scope) === JSON.stringify(body.scope))
        if (dup) {
          send(res, 409, { error: 'role definition already exists for this name/scope' })
          return
        }
        const def: FakeRoleDefinition = {
          tenant: slug, name: body.name, scope: body.scope, description: body.description ?? '', status: 'active', createdAt: new Date().toISOString(),
        }
        state.roleDefinitions[slug] = [...existing, def]
        send(res, 201, def)
        return
      }

      // DELETE .../role-definitions/:id -- retire (soft alias for PATCH
      // {status:'retired'}). Real tower's `:id` is the actor's own
      // composite key (tenant:name or tenant:application:name, routes/
      // role-definitions.ts's keyFor) -- the client computes this itself
      // (tower-client.ts's retireRoleDefinition), not just the bare name.
      const roleDefRetireMatch = /^\/operator\/tenants\/([^/]+)\/role-definitions\/([^/]+)$/.exec(url.pathname)
      if (method === 'DELETE' && roleDefRetireMatch) {
        if (!req.headers['x-operator-actor']) {
          send(res, 400, { error: 'X-Operator-Actor required' })
          return
        }
        const [, slugRaw, idRaw] = roleDefRetireMatch
        const slug = decodeURIComponent(slugRaw)
        const id = decodeURIComponent(idRaw)
        const defs = state.roleDefinitions[slug] ?? []
        const def = defs.find((d) => {
          const dId = typeof d.scope === 'object' ? `${d.tenant}:${d.scope.application}:${d.name}` : `${d.tenant}:${d.name}`
          return dId === id
        })
        if (!def) {
          send(res, 404, { error: 'not found' })
          return
        }
        def.status = 'retired'
        send(res, 200, def)
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
