import { error, fail } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSession } from '$lib/server/guard'
import type { Session } from '$lib/server/session'
import { TowerNotFoundError, TowerRequestError } from '$lib/server/clients/tower'

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { session } = await parent()
	try {
		const [organization, members, roleCatalog] = await Promise.all([
			locals.clients.tower.getOrganization(session.tenantSlug, params.organizationId),
			locals.clients.tower.listOrganizationMembers(session.tenantSlug, params.organizationId),
			locals.clients.tower.listOrganizationRoleCatalog(session.tenantSlug),
		])
		return { organization, members, roleCatalog }
	} catch (err) {
		if (err instanceof TowerNotFoundError) {
			error(404, 'organization not found')
		}
		throw err
	}
}

// SvelteKit form actions run independently of the page's own load chain --
// `+layout.server.ts`'s membership gate does NOT run before an action, so
// every action re-checks membership itself rather than relying on it.
// Beyond that, every action just forwards the caller's own internal JWT to
// tower (`locals.clients.tower`, wired in hooks.server.ts) -- tower is the
// real enforcement point (`requireOrganizationManager`/`requireSelf`),
// exactly like the (admin) surface's own actions. This file's job is
// translating form submissions into the right tower call and surfacing
// its rejections, not re-implementing authorization (Story 001: "a route
// guard bug here is a broken UI, not a security hole").
function requireMember(session: Session | null, organizationId: string): Session {
	const authenticated = requireSession(session)
	if (!authenticated.organizationMemberships.some((m) => m.organizationId === organizationId)) {
		error(403, 'this account is not a member of this organization')
	}
	return authenticated
}

export const actions: Actions = {
	grantRole: async ({ request, locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '').trim()
		const role = String(form.get('role') ?? '').trim()
		if (!accountId || !role) {
			return fail(400, { formError: 'accountId and role are required' })
		}
		try {
			await locals.clients.tower.grantOrganizationRole(session.tenantSlug, params.organizationId, accountId, role)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'that action was rejected -- only a manager can do this' })
			}
			throw err
		}
	},

	revokeRole: async ({ request, locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '')
		const role = String(form.get('role') ?? '')
		try {
			await locals.clients.tower.revokeOrganizationRole(session.tenantSlug, params.organizationId, accountId, role)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: err.body && typeof err.body === 'object' && 'error' in err.body ? String(err.body.error) : 'that action was rejected' })
			}
			throw err
		}
	},

	removeMember: async ({ request, locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '')
		try {
			await locals.clients.tower.removeOrganizationMember(session.tenantSlug, params.organizationId, accountId)
			return { success: true, left: accountId === session.accountId }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'that removal was rejected' })
			}
			throw err
		}
	},

	setSuccessor: async ({ request, locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		const form = await request.formData()
		const successorAccountId = String(form.get('successorAccountId') ?? '').trim()
		if (!successorAccountId) {
			return fail(400, { formError: 'successorAccountId is required' })
		}
		try {
			await locals.clients.tower.setOrganizationSuccessor(session.tenantSlug, params.organizationId, session.accountId, successorAccountId)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'successor must already be a member of this organization' })
			}
			throw err
		}
	},

	clearSuccessor: async ({ locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		await locals.clients.tower.clearOrganizationSuccessor(session.tenantSlug, params.organizationId, session.accountId)
		return { success: true }
	},

	invite: async ({ request, locals, params }) => {
		const session = requireMember(locals.session, params.organizationId)
		const form = await request.formData()
		const email = String(form.get('email') ?? '').trim()
		const organizationRole = String(form.get('organizationRole') ?? '').trim()
		if (!email || !organizationRole) {
			return fail(400, { formError: 'email and organizationRole are required' })
		}
		try {
			await locals.clients.tower.createOrganizationInvite(session.tenantSlug, params.organizationId, { email, organizationRole })
			return { success: true, invited: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'that invite was rejected -- has this organization reached its seat limit?' })
			}
			throw err
		}
	},
}
