import { error, fail } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { TowerNotFoundError, TowerRequestError } from '$lib/server/clients/tower'

export const load: PageServerLoad = async ({ locals, params }) => {
	const session = requireSection(locals.session, 'billing')
	try {
		const [organization, members] = await Promise.all([
			locals.clients.tower.getOrganization(session.tenantSlug, params.organizationId),
			locals.clients.tower.listOrganizationMembers(session.tenantSlug, params.organizationId),
		])
		return { organization, members }
	} catch (err) {
		if (err instanceof TowerNotFoundError) {
			error(404, 'organization not found')
		}
		throw err
	}
}

export const actions: Actions = {
	// Promotes an existing member to co-manager -- tower itself rejects
	// (409) if the target isn't already a member; there's no separate
	// "add member directly" action here at all, only via a real invite
	// (the `invite` action below), matching tower's own posture that
	// membership is only ever granted through invite redemption or an
	// existing manager's own add-manager call on an already-invited member.
	addManager: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '').trim()
		if (!accountId) {
			return fail(400, { formError: 'accountId is required' })
		}
		try {
			await locals.clients.tower.addOrganizationManager(session.tenantSlug, params.organizationId, accountId)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'tower rejected this -- is that account a member of this organization?' })
			}
			throw err
		}
	},

	removeManager: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '')
		try {
			await locals.clients.tower.removeOrganizationManager(session.tenantSlug, params.organizationId, accountId)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				// The one real rejection case here: the sole remaining manager,
				// no successor designated -- tower's own message says as much.
				return fail(err.status >= 500 ? 502 : 409, { formError: err.body && typeof err.body === 'object' && 'error' in err.body ? String(err.body.error) : 'tower rejected this removal' })
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

	// ADR 0098: delegates the narrower organization-billing:manage right to
	// a plain member without making them a co-manager. Tower itself gates
	// this on the caller holding organization:manage for this org (or
	// accounts:manage) -- a 403 here means the signed-in operator's own
	// session doesn't have it, not a problem with the target account.
	grantBillingAccess: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '').trim()
		if (!accountId) {
			return fail(400, { formError: 'accountId is required' })
		}
		try {
			await locals.clients.tower.grantBillingAccess(session.tenantSlug, params.organizationId, accountId)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'tower rejected this -- is that account a member of this organization?' })
			}
			throw err
		}
	},

	revokeBillingAccess: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()
		const accountId = String(form.get('accountId') ?? '')
		try {
			await locals.clients.tower.revokeBillingAccess(session.tenantSlug, params.organizationId, accountId)
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, { formError: 'tower rejected this revoke' })
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
		const organizationRole = form.get('organizationRole') === 'manager' ? 'manager' : 'member'
		if (!contactId) {
			return fail(400, { formError: 'contactId is required' })
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
