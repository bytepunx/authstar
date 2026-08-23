import { fail } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { KeepRequestError } from '$lib/server/clients/keep'

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'billing')
	const config = await locals.clients.keep.getStripeConfig(session.tenantSlug)
	return { configured: config?.configured ?? false }
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()

		const secretKey = String(form.get('secretKey') ?? '').trim()
		const webhookSecret = String(form.get('webhookSecret') ?? '').trim()

		const fieldErrors: Record<string, string> = {}
		if (!secretKey) fieldErrors.secretKey = 'Stripe secret key is required'
		if (!webhookSecret) fieldErrors.webhookSecret = 'webhook signing secret is required'
		if (Object.keys(fieldErrors).length > 0) {
			return fail(400, { fieldErrors })
		}

		try {
			await locals.clients.keep.setStripeConfig(session.tenantSlug, { secretKey, webhookSecret })
			return { success: true }
		} catch (err) {
			if (err instanceof KeepRequestError) {
				return fail(err.status >= 500 ? 502 : 400, {
					formError: 'keep rejected this key -- check it against the tenant\'s actual Stripe account and try again',
				})
			}
			throw err
		}
	},
}
