import { fail } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSession } from '$lib/server/guard'
import { TowerNotFoundError, TowerRequestError } from '$lib/server/clients/tower'
import { accountRolesForApplication } from '$lib/server/api-key-roles'

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const { session } = await parent()
	const account = await locals.clients.tower.getAccount(session.tenantSlug, session.accountId)
	const availableRoles = accountRolesForApplication(account.grantedRoles, params.applicationSlug)
	const canManage = availableRoles.includes('api-keys:manage')
	// Tower's own `requireAppRole` would 403 this call anyway if `canManage`
	// were somehow wrong (a route-guard bug here is a broken UI, not a
	// security hole -- guard.ts's own framing) -- skipping the call entirely
	// when we already know it would fail avoids a pointless round trip and a
	// confusing "forbidden" state on first load.
	const keys = canManage ? await locals.clients.tower.listPersonalApiKeys(session.tenantSlug, params.applicationSlug) : []
	return { availableRoles, canManage, keys }
}

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const session = requireSession(locals.session)
		const form = await request.formData()
		const name = String(form.get('name') ?? '').trim()
		const grantedRoles = form.getAll('grantedRoles').map(String)

		if (!name) return fail(400, { formError: 'name is required' })
		if (grantedRoles.length === 0) return fail(400, { formError: 'select at least one role to grant' })

		try {
			const created = await locals.clients.tower.createPersonalApiKey(session.tenantSlug, params.applicationSlug, { name, grantedRoles })
			// The one and only place this key's secret is ever available --
			// read only from this action's own ephemeral result data
			// (`form.created` in +page.svelte), never persisted into `load`/
			// `PageData`, so a reload can never re-display it.
			return { success: true, created }
		} catch (err) {
			if (err instanceof TowerNotFoundError) {
				return fail(404, { formError: 'application not found' })
			}
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : err.status, {
					formError: 'that key could not be created -- check you still hold every role you selected, and that you haven\'t reached your API key limit',
				})
			}
			throw err
		}
	},

	revoke: async ({ request, locals, params }) => {
		const session = requireSession(locals.session)
		const form = await request.formData()
		const apiKeyId = String(form.get('apiKeyId') ?? '')

		try {
			await locals.clients.tower.revokePersonalApiKey(session.tenantSlug, params.applicationSlug, apiKeyId)
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
