import { error, fail } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSession } from '$lib/server/guard'
import type { Session } from '$lib/server/session'
import { TowerNotFoundError, TowerRequestError } from '$lib/server/clients/tower'
import { organizationRolesForApplication } from '$lib/server/api-key-roles'

// design/decisions/0101-api-keys.md. Reuses the *existing* org embed
// layout (`(embed)/organizations/[organizationId]/+layout.server.ts`) via
// ordinary SvelteKit route nesting -- no new layout file, no new membership
// gate -- rather than a parallel tree, exactly like every other page under
// that same `[organizationId]` segment.

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { session, isManager } = await parent()
	try {
		const organization = await locals.clients.tower.getOrganization(session.tenantSlug, params.organizationId)
		const availableRoles = organizationRolesForApplication(organization.grantedRoles, params.applicationSlug)
		// Manager status alone isn't enough -- the org itself must also
		// currently hold `api-keys:manage` for this application (tower's own
		// `requireOrganizationHasAppRole` is the real enforcement; this is
		// just what decides whether to render the create form at all).
		const canManage = isManager && availableRoles.includes('api-keys:manage')
		const keys = canManage
			? await locals.clients.tower.listOrganizationApiKeys(session.tenantSlug, params.organizationId, params.applicationSlug)
			: []
		return { availableRoles, canManage, keys }
	} catch (err) {
		if (err instanceof TowerNotFoundError) {
			error(404, 'organization not found')
		}
		throw err
	}
}

// Same "actions don't inherit the layout's own load, so re-check
// membership independently" posture the org page's own actions already
// document -- see that file's header comment.
function requireMember(session: Session | null, organizationId: string): Session {
	const authenticated = requireSession(session)
	if (!authenticated.organizationMemberships.some((m) => m.organizationId === organizationId)) {
		error(403, 'this account is not a member of this organization')
	}
	return authenticated
}

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		const form = await request.formData()
		const name = String(form.get('name') ?? '').trim()
		const grantedRoles = form.getAll('grantedRoles').map(String)

		if (!name) return fail(400, { formError: 'name is required' })
		if (grantedRoles.length === 0) return fail(400, { formError: 'select at least one role to grant' })

		try {
			const created = await locals.clients.tower.createOrganizationApiKey(session.tenantSlug, params.organizationId, params.applicationSlug, { name, grantedRoles })
			return { success: true, created }
		} catch (err) {
			if (err instanceof TowerNotFoundError) {
				return fail(404, { formError: 'application not found' })
			}
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : err.status, {
					formError: 'that key could not be created -- only a manager of this organization can create keys, and only for roles the organization currently holds',
				})
			}
			throw err
		}
	},

	revoke: async ({ request, locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		const form = await request.formData()
		const apiKeyId = String(form.get('apiKeyId') ?? '')

		try {
			await locals.clients.tower.revokeOrganizationApiKey(session.tenantSlug, params.organizationId, params.applicationSlug, apiKeyId)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerNotFoundError) {
				return fail(404, { formError: 'key not found' })
			}
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : err.status, { formError: 'that key could not be revoked' })
			}
			throw err
		}
	},
}
