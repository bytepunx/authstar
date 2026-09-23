import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import type { ApplicationDetail, Organization, OrganizationInvite, OrganizationMembership, OrganizationRoleDefinition } from '../../src/lib/server/clients/tower'

// A small, real HTTP stand-in for tower's application routes (tower Story
// 004) plus tower's public pre-tenant `/tenants` ingress (Story 010's
// signup page) and a same-origin `/_authstar/me/subscription` route (Story
// 011's widget). Deliberately plain `node:http`, no fastify -- this is a
// test fixture, not a real service, and staying dependency-free keeps it
// usable both as an in-process vitest fixture (spec/integration) and as a
// Playwright `webServer` subprocess (e2e/), without pulling fastify's own
// AJV-default gotcha into a place it doesn't need to be.
//
// This is the "integration" tier's actual backend stand-in: real HTTP,
// real JSON parsing/serialization, real status codes -- proving `web`'s
// own tower client (src/lib/server/clients/tower.ts) works over the wire,
// not just against an in-process fake object the way spec/behavior does.

const PROVIDERS = [
	{ name: 'google', label: 'Google' },
	{ name: 'github', label: 'GitHub' },
]

const INTERNAL_JWT_KID = 'fake-tower-e2e-key'

// Lazily generated and cached -- this fixture doubles as a stand-in for
// signet's per-tenant internal-token keypair (portcullis Story 010) so
// e2e/ specs can mint a real, verifiable internal JWT via `POST /__sign`
// and point `web`'s `INTERNAL_JWT_JWKS_URL` at `GET /__jwks` for the same
// key. Real signet-backed key rotation/per-tenant keys are out of scope
// here (see TESTING.md) -- one fixed keypair for the whole fixture process
// is enough to prove the verify-then-render path actually works end to end.
let keyPairPromise: ReturnType<typeof generateKeyPair> | null = null
function getKeyPair() {
	if (!keyPairPromise) keyPairPromise = generateKeyPair('ES256')
	return keyPairPromise
}

export interface FakeTowerServerOptions {
	/** If set, serves this directory's files for any GET path not otherwise handled -- the widget-embed e2e test's plain HTML host page. */
	staticDir?: string
	/** If set, serves this directory's files under `/widgets/*` -- the built widget bundle (dist-widgets/), same origin as the host page, exactly like a real adopting application would fetch it. */
	widgetsDir?: string
}

export function createFakeTowerServer(options: FakeTowerServerOptions = {}): Server {
	const applications = new Map<string, Map<string, ApplicationDetail>>()
	let nextCredentialId = 1

	// ADR 0100 -- a bare-bones stand-in for tower's organizations,
	// organizationMembership records, and organization-invites surfaces.
	// Like the rest of this fixture, it doesn't enforce tower's own
	// business rules (e.g. the sole-manager/no-successor removal guard) --
	// those are proven at tower's own behavior tier. This is only here to
	// prove `web`'s admin UI wiring works over real HTTP end to end.
	const organizations = new Map<string, Map<string, Organization>>()
	const memberships = new Map<string, Map<string, OrganizationMembership>>()
	const organizationInvites: OrganizationInvite[] = []
	let nextOrganizationId = 1
	let nextMembershipId = 1

	const ORGANIZATION_ROLE_CATALOG: OrganizationRoleDefinition[] = [
		{ name: 'manager', scope: 'organization', status: 'active' },
		{ name: 'member', scope: 'organization', status: 'active' },
		{ name: 'billingAdmin', scope: 'organization', status: 'active' },
		{ name: 'billingViewer', scope: 'organization', status: 'active' },
	]

	function tenantStore(tenant: string): Map<string, ApplicationDetail> {
		let store = applications.get(tenant)
		if (!store) {
			store = new Map()
			applications.set(tenant, store)
		}
		return store
	}

	function organizationStore(tenant: string): Map<string, Organization> {
		let store = organizations.get(tenant)
		if (!store) {
			store = new Map()
			organizations.set(tenant, store)
		}
		return store
	}

	function membershipStore(tenant: string): Map<string, OrganizationMembership> {
		let store = memberships.get(tenant)
		if (!store) {
			store = new Map()
			memberships.set(tenant, store)
		}
		return store
	}

	function findMembership(tenant: string, organizationId: string, accountId: string): OrganizationMembership | undefined {
		return [...membershipStore(tenant).values()].find((m) => m.organizationId === organizationId && m.accountId === accountId)
	}

	function send(res: ServerResponse, status: number, body?: unknown) {
		res.writeHead(status, {
			'content-type': 'application/json',
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
			'access-control-allow-headers': 'content-type, authorization',
		})
		res.end(body === undefined ? undefined : JSON.stringify(body))
	}

	async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
		const chunks: Buffer[] = []
		for await (const chunk of req) chunks.push(chunk as Buffer)
		const raw = Buffer.concat(chunks).toString('utf8')
		if (!raw) return {}
		return JSON.parse(raw) as Record<string, unknown>
	}

	async function serveStatic(res: ServerResponse, staticDir: string, pathname: string) {
		const relative = pathname === '/' ? '/index.html' : pathname
		const filePath = join(staticDir, relative)
		try {
			const contents = await readFile(filePath)
			const ext = extname(filePath)
			const contentType =
				ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'application/octet-stream'
			res.writeHead(200, { 'content-type': contentType, 'access-control-allow-origin': '*' })
			res.end(contents)
		} catch {
			res.writeHead(404)
			res.end('not found')
		}
	}

	return createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://fake-tower.local')
		const segments = url.pathname.split('/').filter(Boolean)

		if (req.method === 'OPTIONS') {
			send(res, 204)
			return
		}

		// Test-only convenience: reset in-memory state between tests/specs.
		if (req.method === 'POST' && url.pathname === '/__reset') {
			applications.clear()
			nextCredentialId = 1
			organizations.clear()
			memberships.clear()
			organizationInvites.length = 0
			nextOrganizationId = 1
			nextMembershipId = 1
			send(res, 204)
			return
		}

		// Test-only: seed membership rows directly. Real tower only ever
		// creates one via organization creation or invite redemption, which
		// this fixture doesn't model -- e2e specs need a way to get a member
		// onto an organization's roster without walking that whole flow first.
		if (req.method === 'POST' && url.pathname === '/__seed/memberships') {
			const body = (await readJsonBody(req)) as { tenant?: string; memberships?: Array<Partial<OrganizationMembership>> }
			const store = membershipStore(String(body.tenant ?? ''))
			for (const m of body.memberships ?? []) {
				const membershipId = String(m.membershipId ?? `membership_${nextMembershipId++}`)
				store.set(membershipId, {
					membershipId,
					tenant: String(body.tenant ?? ''),
					accountId: String(m.accountId ?? ''),
					organizationId: String(m.organizationId ?? ''),
					roles: m.roles ?? ['member'],
					successorAccountId: m.successorAccountId ?? null,
				})
			}
			send(res, 204)
			return
		}

		// Test-only: JWKS for the fixture's own internal-token stand-in key.
		if (req.method === 'GET' && url.pathname === '/__jwks') {
			const { publicKey } = await getKeyPair()
			const jwk = await exportJWK(publicKey)
			jwk.kid = INTERNAL_JWT_KID
			jwk.alg = 'ES256'
			send(res, 200, { keys: [jwk] })
			return
		}

		// Test-only: mint a real internal JWT signed by this fixture's key,
		// so e2e/ specs can drive the real admin app as an authenticated
		// account without real signet/portcullis in front of it. `tenant`
		// (ADR 0089) is pulled off the request body and set on the protected
		// *header*, not the payload -- the same place portcullis's real
		// sign_internal puts it, and where web's own verifyInternalJwt (via
		// @bytepunx/authstar-core) reads it back from after verification.
		if (req.method === 'POST' && url.pathname === '/__sign') {
			const { tenant, ...claims } = await readJsonBody(req)
			const { privateKey } = await getKeyPair()
			const token = await new SignJWT(claims)
				.setProtectedHeader({ alg: 'ES256', kid: INTERNAL_JWT_KID, tenant: tenant ?? 'acme' })
				.setExpirationTime('5m')
				.sign(privateKey)
			send(res, 200, { token })
			return
		}

		// Story 010 signup: POST /tenants, public, no auth.
		if (req.method === 'POST' && url.pathname === '/tenants') {
			const body = await readJsonBody(req)
			if (!body.slug || !body.name || !body.adminEmail) {
				send(res, 400, { error: 'name, slug, and adminEmail are required' })
				return
			}
			if (body.slug === 'taken') {
				send(res, 409, { error: 'slug already in use' })
				return
			}
			send(res, 201, { slug: body.slug })
			return
		}

		// Story 011 widget: GET /_authstar/me/subscription?status=...
		if (req.method === 'GET' && url.pathname === '/_authstar/me/subscription') {
			const status = url.searchParams.get('status') ?? 'active'
			if (status === 'null') {
				send(res, 200, { status: null, planName: null, currentPeriodEnd: null })
				return
			}
			send(res, 200, {
				status,
				planName: 'Growth',
				currentPeriodEnd: status === 'active' || status === 'trialing' ? '2026-09-01' : null,
			})
			return
		}

		// /tenants/:tenant/applications[...], /tenants/:tenant/organizations[...],
		// /tenants/:tenant/role-definitions
		if (segments[0] === 'tenants' && segments[1]) {
			const tenant = segments[1]

			if (segments[2] === 'providers' && segments.length === 3 && req.method === 'GET') {
				send(res, 200, PROVIDERS)
				return
			}

			if (segments[2] === 'applications') {
				const store = tenantStore(tenant)

				if (segments.length === 3 && req.method === 'GET') {
					send(
						res,
						200,
						[...store.values()].map((app) => ({
							slug: app.slug,
							name: app.name,
							hosts: app.hosts,
							status: app.status,
						})),
					)
					return
				}

				if (segments.length === 3 && req.method === 'POST') {
					const body = await readJsonBody(req)
					const slug = String(body.slug ?? '')
					if (store.has(slug)) {
						send(res, 409, { error: 'slug already exists' })
						return
					}
					const created: ApplicationDetail = {
						slug,
						name: String(body.name ?? ''),
						status: 'active',
						hosts: (body.hosts as string[]) ?? [],
						primaryHost: String(body.primaryHost ?? ''),
						publicUrl: `https://${body.primaryHost}`,
						upstream: (body.upstream as ApplicationDetail['upstream']) ?? {
							baseUrl: '',
							prefixRoutes: [],
							timeout: 30,
						},
						cors: (body.cors as ApplicationDetail['cors']) ?? { allowedOrigins: [] },
						exemptPaths: (body.exemptPaths as string[]) ?? [],
						loginUrl: `https://${body.primaryHost}/oauth2/select`,
						exposedProviders: (body.exposedProviders as string[]) ?? [],
						usageCredentials: [],
					}
					store.set(slug, created)
					send(res, 201, created)
					return
				}

				const slug = segments[3]
				if (slug && segments.length === 4) {
					const existing = store.get(slug)
					if (req.method === 'GET') {
						if (!existing) {
							send(res, 404, { error: 'not found' })
							return
						}
						send(res, 200, existing)
						return
					}
					if (req.method === 'PATCH') {
						if (!existing) {
							send(res, 404, { error: 'not found' })
							return
						}
						const body = await readJsonBody(req)
						const updated: ApplicationDetail = {
							...existing,
							...(body.name !== undefined ? { name: String(body.name) } : {}),
							...(body.hosts !== undefined ? { hosts: body.hosts as string[] } : {}),
							...(body.primaryHost !== undefined ? { primaryHost: String(body.primaryHost) } : {}),
							...(body.upstream !== undefined ? { upstream: body.upstream as ApplicationDetail['upstream'] } : {}),
							...(body.cors !== undefined ? { cors: body.cors as ApplicationDetail['cors'] } : {}),
							...(body.exemptPaths !== undefined ? { exemptPaths: body.exemptPaths as string[] } : {}),
							...(body.exposedProviders !== undefined
								? { exposedProviders: body.exposedProviders as string[] }
								: {}),
							...(body.status !== undefined ? { status: body.status as ApplicationDetail['status'] } : {}),
						}
						store.set(slug, updated)
						send(res, 200, updated)
						return
					}
					if (req.method === 'DELETE') {
						if (!existing) {
							send(res, 404, { error: 'not found' })
							return
						}
						store.set(slug, { ...existing, status: 'deleted' })
						send(res, 204)
						return
					}
				}

				if (slug && segments[4] === 'usage-credentials') {
					const existing = store.get(slug)
					if (!existing) {
						send(res, 404, { error: 'not found' })
						return
					}
					if (segments.length === 5 && req.method === 'POST') {
						const credentialId = `cred_${nextCredentialId++}`
						existing.usageCredentials.push({
							credentialId,
							status: 'active',
							createdAt: new Date().toISOString(),
						})
						send(res, 201, { credentialId, secret: `secret_${credentialId}` })
						return
					}
					const credentialId = segments[5]
					if (credentialId && segments.length === 6 && req.method === 'DELETE') {
						const credential = existing.usageCredentials.find((c) => c.credentialId === credentialId)
						if (!credential) {
							send(res, 404, { error: 'not found' })
							return
						}
						credential.status = 'revoked'
						send(res, 204)
						return
					}
				}
			}

			if (segments[2] === 'role-definitions' && segments.length === 3 && req.method === 'GET') {
				const scope = url.searchParams.get('scope')
				const status = url.searchParams.get('status')
				const results = ORGANIZATION_ROLE_CATALOG.filter((r) => (!scope || r.scope === scope) && (!status || r.status === status))
				send(res, 200, results)
				return
			}

			if (segments[2] === 'organizations') {
				const store = organizationStore(tenant)

				if (segments.length === 3 && req.method === 'GET') {
					send(res, 200, [...store.values()])
					return
				}

				if (segments.length === 3 && req.method === 'POST') {
					const body = (await readJsonBody(req)) as Partial<Organization>
					const organizationId = String(body.organizationId ?? `org_${nextOrganizationId++}`)
					const created: Organization = {
						organizationId,
						tenant,
						name: String(body.name ?? ''),
						grantedRoles: body.grantedRoles ?? [],
						seatLimit: body.seatLimit ?? null,
					}
					store.set(organizationId, created)
					send(res, 201, created)
					return
				}

				const organizationId = segments[3]
				if (organizationId && segments.length === 4 && req.method === 'GET') {
					const existing = store.get(organizationId)
					if (!existing) {
						send(res, 404, { error: 'not found' })
						return
					}
					send(res, 200, existing)
					return
				}

				if (organizationId && segments[4] === 'members') {
					if (segments.length === 5 && req.method === 'GET') {
						const roster = [...membershipStore(tenant).values()].filter((m) => m.organizationId === organizationId)
						send(res, 200, roster)
						return
					}

					const memberAccountId = segments[5]

					if (memberAccountId && segments[6] === 'roles') {
						const membership = findMembership(tenant, organizationId, memberAccountId)
						if (!membership) {
							send(res, 404, { error: 'not found' })
							return
						}
						if (segments.length === 7 && req.method === 'POST') {
							const body = await readJsonBody(req)
							const role = String(body.role ?? '')
							if (!membership.roles.includes(role)) membership.roles = [...membership.roles, role]
							send(res, 200, membership)
							return
						}
						const role = segments[7]
						if (role && segments.length === 8 && req.method === 'DELETE') {
							membership.roles = membership.roles.filter((r) => r !== decodeURIComponent(role))
							send(res, 200, membership)
							return
						}
					}

					if (memberAccountId && segments[6] === 'successor') {
						const membership = findMembership(tenant, organizationId, memberAccountId)
						if (!membership) {
							send(res, 404, { error: 'not found' })
							return
						}
						if (segments.length === 7 && req.method === 'PUT') {
							const body = await readJsonBody(req)
							membership.successorAccountId = String(body.successorAccountId ?? '')
							send(res, 200, membership)
							return
						}
						if (segments.length === 7 && req.method === 'DELETE') {
							membership.successorAccountId = null
							send(res, 200, membership)
							return
						}
					}

					if (memberAccountId && segments.length === 6 && req.method === 'DELETE') {
						const membership = findMembership(tenant, organizationId, memberAccountId)
						if (!membership) {
							send(res, 404, { error: 'not found' })
							return
						}
						membershipStore(tenant).delete(membership.membershipId)
						send(res, 204)
						return
					}
				}

				if (organizationId && segments[4] === 'invites' && segments.length === 5 && req.method === 'POST') {
					const existing = store.get(organizationId)
					if (!existing) {
						send(res, 404, { error: 'not found' })
						return
					}
					const body = (await readJsonBody(req)) as {
						contactId?: string
						email?: string
						organizationRole?: string
						expiresAt?: string | null
					}
					const invite: OrganizationInvite = {
						token: `invite_${organizationInvites.length + 1}`,
						tenant,
						contactId: String(body.contactId ?? `contact-for-${body.email ?? ''}`),
						organizationId,
						organizationRole: body.organizationRole ?? 'member',
						status: 'pending',
						createdAt: new Date().toISOString(),
						expiresAt: body.expiresAt ?? null,
					}
					organizationInvites.push(invite)
					send(res, 201, invite)
					return
				}
			}
		}

		if (req.method === 'GET' && options.widgetsDir && url.pathname.startsWith('/widgets/')) {
			await serveStatic(res, options.widgetsDir, url.pathname.slice('/widgets'.length))
			return
		}

		if (req.method === 'GET' && options.staticDir) {
			await serveStatic(res, options.staticDir, url.pathname)
			return
		}

		send(res, 404, { error: 'not found' })
	})
}

// Standalone runnable for Playwright's `webServer` -- `tsx
// spec/fixtures/fake-tower-server.ts`, PORT env var controls the port.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
	const port = Number(process.env.PORT ?? 5175)
	const staticDir = process.env.FAKE_TOWER_STATIC_DIR
	const widgetsDir = process.env.FAKE_TOWER_WIDGETS_DIR
	const server = createFakeTowerServer({ staticDir, widgetsDir })
	server.listen(port, () => {
		console.log(`fake-tower-server listening on ${port}${staticDir ? ` (static: ${staticDir})` : ''}`)
	})
}
