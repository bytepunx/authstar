import { error, fail, redirect } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { TowerNotFoundError, TowerRequestError } from '$lib/server/clients/tower'

export const load: PageServerLoad = async ({ locals, params }) => {
	const session = requireSection(locals.session, 'applications')
	try {
		const [application, providers] = await Promise.all([
			locals.clients.tower.getApplication(session.tenantSlug, params.slug),
			locals.clients.tower.listProviders(session.tenantSlug),
		])
		return { application, providers }
	} catch (err) {
		if (err instanceof TowerNotFoundError) {
			error(404, 'application not found')
		}
		throw err
	}
}

function splitList(value: FormDataEntryValue | null): string[] {
	if (typeof value !== 'string' || value.trim() === '') return []
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
}

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'applications')
		const form = await request.formData()

		try {
			await locals.clients.tower.updateApplication(session.tenantSlug, params.slug, {
				// slug is deliberately never read from the form -- Story 003:
				// immutable after creation, not editable at all, not merely
				// rejected on submit.
				name: String(form.get('name') ?? '').trim() || undefined,
				hosts: splitList(form.get('hosts')),
				primaryHost: String(form.get('primaryHost') ?? '').trim() || undefined,
				upstream: {
					baseUrl: String(form.get('upstreamBaseUrl') ?? '').trim(),
					prefixRoutes: splitList(form.get('prefixRoutes')),
					timeout: Number(form.get('timeout') ?? 30),
				},
				cors: { allowedOrigins: splitList(form.get('allowedOrigins')) },
				exemptPaths: splitList(form.get('exemptPaths')),
				exposedProviders: form.getAll('exposedProviders').map(String),
			})
			return { success: true }
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, {
					formError: 'tower rejected this update',
				})
			}
			throw err
		}
	},

	delete: async ({ locals, params }) => {
		// Story 003 (Delete): a soft alias for PATCH { status: "deleted" }
		// server-side -- this action calls the DELETE route, matching the
		// button's own verb, while the confirmation copy in the page
		// component is what's responsible for being honest that this
		// deactivates rather than destroys the record.
		const session = requireSection(locals.session, 'applications')
		await locals.clients.tower.deleteApplication(session.tenantSlug, params.slug)
		redirect(303, '/applications')
	},

	issueCredential: async ({ locals, params }) => {
		const session = requireSection(locals.session, 'applications')
		const credential = await locals.clients.tower.issueUsageCredential(session.tenantSlug, params.slug)
		// Rendered once, in the page's dismissible reveal panel -- never
		// persisted anywhere `web` itself can read it back (Story 003: "the
		// same one-time-reveal pattern as every other secret in this design").
		return { issuedCredential: credential }
	},

	revokeCredential: async ({ request, locals, params }) => {
		const session = requireSection(locals.session, 'applications')
		const form = await request.formData()
		const credentialId = String(form.get('credentialId') ?? '')
		if (!credentialId) {
			return fail(400, { formError: 'missing credentialId' })
		}
		await locals.clients.tower.revokeUsageCredential(session.tenantSlug, params.slug, credentialId)
		return { revoked: credentialId }
	},
}
