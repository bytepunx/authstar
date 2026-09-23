import { error } from '@sveltejs/kit'
import type { LayoutServerLoad } from './$types'
import { requireSession } from '$lib/server/guard'

// ADR 0100/0099: the embeddable, customer-facing counterpart to the
// tenant-staff-only (admin)/billing/organizations screen -- a tenant
// application (loci, so far) embeds this via <iframe> instead of rebuilding
// member-management forms against tower's raw API. Auth rides the same
// shared session cookie every tenant app already has (same-registrable-
// domain, so this is same-site, not subject to third-party-cookie
// restrictions) -- gated on the caller's own `organizationMemberships`
// including this org, never the tenant-staff `permissions` grant the
// (admin) surface checks.
export const load: LayoutServerLoad = async ({ locals, params, url }) => {
	const session = requireSession(locals.session)
	const isMember = session.organizationMemberships.some((m) => m.organizationId === params.organizationId)
	if (!isMember) {
		error(403, 'this account is not a member of this organization')
	}

	// A small, explicit set of CSS custom properties, not arbitrary CSS
	// injection -- an iframe's document is isolated from the host page's
	// own stylesheet, so this is the only way a host app's branding can
	// cross the boundary. Extend this set as real theming needs appear;
	// never accept a raw stylesheet or CSS string here. Values are
	// pattern-validated, not just interpolated -- a query param is
	// attacker-influenceable in principle even though the realistic actor
	// here is the tenant app choosing its own embed's theme.
	const primaryColorParam = url.searchParams.get('primaryColor')
	const fontFamilyParam = url.searchParams.get('fontFamily')
	const theme = {
		primaryColor: primaryColorParam && /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$/.test(primaryColorParam) ? primaryColorParam : undefined,
		fontFamily: fontFamilyParam && /^[a-zA-Z0-9 ,'"-]{1,80}$/.test(fontFamilyParam) ? fontFamilyParam : undefined,
	}

	return {
		session,
		theme,
		isManager: session.organizationMemberships.some((m) => m.organizationId === params.organizationId && m.roles.includes('manager')),
	}
}
