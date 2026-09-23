import { error, fail } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { TowerNotFoundError, TowerRequestError } from '$lib/server/clients/tower'

export const load: PageServerLoad = async ({ locals, params }) => {
	const session = requireSection(locals.session, 'billing')
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

export const actions: Actions = {
	// ADR 0100: a single generic grant/revoke pair for any org-scope role
	// (manager, billingAdmin/billingViewer, or a tenant-defined custom
	// role) -- there's no longer a separate mechanism per role, it's just
	// a role now. Tower itself rejects (404) if the target isn't already a
	// member; there's no "add member directly" action here at all, only
	// via a real invite (the `invite` action below).
	grantRole: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
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
				return fail(err.status >= 500 ? 502 : 409, { formError: 'tower rejected this -- is that account a member of this organization?' })
			}
			throw err
		}
	},

	revokeRole: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '')
		const role = String(form.get('role') ?? '')
		try {
			await locals.clients.tower.revokeOrganizationRole(session.tenantSlug, params.organizationId, accountId, role)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				// The one real rejection case here: revoking 'manager' from the
				// sole remaining manager, no successor designated -- tower's own
				// message says as much.
				return fail(err.status >= 500 ? 502 : 409, { formError: err.body && typeof err.body === 'object' && 'error' in err.body ? String(err.body.error) : 'tower rejected this' })
			}
			throw err
		}
	},

	removeMember: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '')
		try {
			await locals.clients.tower.removeOrganizationMember(session.tenantSlug, params.organizationId, accountId)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'tower rejected this removal' })
			}
			throw err
		}
	},

	// No contact-search UI exists anywhere in this app yet (no Accounts/
	// Identity screen is built) -- contactId is a raw text field for now,
	// same limitation every other not-yet-built admin surface in this
	// codebase has, not something new introduced here.
	invite: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const contactId = String(form.get('contactId') ?? '').trim()
		const organizationRole = String(form.get('organizationRole') ?? '').trim()
		if (!contactId || !organizationRole) {
			return fail(400, { formError: 'contactId and organizationRole are required' })
		}
		try {
			await locals.clients.tower.createOrganizationInvite(session.tenantSlug, params.organizationId, { contactId, organizationRole })
			return { success: true, invited: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'tower rejected this invite' })
			}
			throw err
		}
	},
}
