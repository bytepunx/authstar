import { fail, redirect } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { TowerRequestError } from '$lib/server/clients/tower'

export const load: PageServerLoad = async ({ locals }) => {
	const session = requireSection(locals.session, 'applications')
	const providers = await locals.clients.tower.listProviders(session.tenantSlug)
	return { providers }
}

function splitList(value: FormDataEntryValue | null): string[] {
	if (typeof value !== 'string' || value.trim() === '') return []
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const session = requireSection(locals.session, 'applications')
		const form = await request.formData()

		const slug = String(form.get('slug') ?? '').trim()
		const name = String(form.get('name') ?? '').trim()
		const hosts = splitList(form.get('hosts'))
		const primaryHost = String(form.get('primaryHost') ?? '').trim()
		const upstreamBaseUrl = String(form.get('upstreamBaseUrl') ?? '').trim()

		const fieldErrors: Record<string, string> = {}
		if (!slug) fieldErrors.slug = 'slug is required'
		if (!name) fieldErrors.name = 'name is required'
		if (hosts.length === 0) fieldErrors.hosts = 'at least one host is required'
		if (!primaryHost) {
			fieldErrors.primaryHost = 'a primary host is required'
		} else if (!hosts.includes(primaryHost)) {
			fieldErrors.primaryHost = 'primary host must be one of the listed hosts'
		}
		if (!upstreamBaseUrl) fieldErrors.upstreamBaseUrl = 'upstream base URL is required'

		if (Object.keys(fieldErrors).length > 0) {
			return fail(400, { fieldErrors, values: Object.fromEntries(form) })
		}

		try {
			const created = await locals.clients.tower.createApplication(session.tenantSlug, {
				slug,
				name,
				hosts,
				primaryHost,
				upstream: {
					baseUrl: upstreamBaseUrl,
					prefixRoutes: splitList(form.get('prefixRoutes')),
					timeout: Number(form.get('timeout') ?? 30),
				},
				cors: { allowedOrigins: splitList(form.get('allowedOrigins')) },
				exemptPaths: splitList(form.get('exemptPaths')),
				exposedProviders: form.getAll('exposedProviders').map(String),
			})
			redirect(303, `/applications/${created.slug}`)
		} catch (err) {
			if (err instanceof TowerRequestError) {
				return fail(err.status >= 500 ? 502 : 409, {
					formError: 'tower rejected this application -- check the slug is unique and try again',
					values: Object.fromEntries(form),
				})
			}
			throw err
		}
	},
}
