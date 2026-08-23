import { fail, redirect } from '@sveltejs/kit'
import type { Actions, PageServerLoad } from './$types'
import { requireSection } from '$lib/server/guard'
import { KeepRequestError } from '$lib/server/clients/keep'
import type { GrantedRole } from '$lib/server/clients/keep'

export const load: PageServerLoad = async ({ locals }) => {
	requireSection(locals.session, 'billing')
	return {}
}

// "loci:plan:family,loci:plan:business" -> [{application: 'loci', role:
// 'plan:family'}, {application: 'loci', role: 'plan:business'}] -- same
// comma-separated-list convention the applications/new form already uses
// for hosts/exemptPaths/etc. Splits only on the FIRST colon in each entry --
// role names are an open, app-owned vocabulary (ADR 0069) that routinely
// contain colons themselves (e.g. tower's own "plan:business"), so
// `entry.split(':')` would silently truncate those at the second colon.
function parseGrantedRoles(value: FormDataEntryValue | null): { roles: GrantedRole[]; invalid: string[] } {
	if (typeof value !== 'string' || value.trim() === '') return { roles: [], invalid: [] }
	const roles: GrantedRole[] = []
	const invalid: string[] = []
	for (const entry of value.split(',').map((e) => e.trim()).filter(Boolean)) {
		const sep = entry.indexOf(':')
		const application = sep === -1 ? '' : entry.slice(0, sep).trim()
		const role = sep === -1 ? '' : entry.slice(sep + 1).trim()
		if (!application || !role) {
			invalid.push(entry)
			continue
		}
		roles.push({ application, role })
	}
	return { roles, invalid }
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const session = requireSection(locals.session, 'billing')
		const form = await request.formData()

		const stripePriceId = String(form.get('stripePriceId') ?? '').trim()
		const name = String(form.get('name') ?? '').trim()
		const seatLimitRaw = String(form.get('seatLimit') ?? '').trim()
		const { roles: grantedRoles, invalid: invalidRoles } = parseGrantedRoles(form.get('grantedRoles'))

		const fieldErrors: Record<string, string> = {}
		if (!stripePriceId) fieldErrors.stripePriceId = 'Stripe price ID is required'
		if (!name) fieldErrors.name = 'name is required'
		if (invalidRoles.length > 0) {
			fieldErrors.grantedRoles = `each entry must be "application:role" -- invalid: ${invalidRoles.join(', ')}`
		}
		if (Object.keys(fieldErrors).length > 0) {
			return fail(400, { fieldErrors, values: Object.fromEntries(form) })
		}

		try {
			const created = await locals.clients.keep.createPlanMapping(session.tenantSlug, {
				stripePriceId,
				name,
				seatLimit: seatLimitRaw ? Number(seatLimitRaw) : null,
				grantedRoles,
				meter: String(form.get('meter') ?? '').trim() || null,
			})
			redirect(303, `/billing/plan-mappings#${created.id}`)
		} catch (err) {
			if (err instanceof KeepRequestError) {
				return fail(err.status >= 500 ? 502 : 400, {
					formError:
						'keep rejected this plan mapping -- check the Stripe price ID resolves against this tenant\'s account and every granted role references an existing, active application/role',
					values: Object.fromEntries(form),
				})
			}
			throw err
		}
	},
}
