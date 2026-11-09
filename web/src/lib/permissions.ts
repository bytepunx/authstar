// Section-gating model shared between server route guards (+layout.server.ts)
// and the nav's client-rendered hiding -- Story 001: "Route-level enforcement
// backs the navigation-level hiding," so both read from this one table
// rather than maintaining the permission list twice. This module is plain
// TypeScript with no server/browser dependency so it can be imported from
// either side, and unit-tested with no DOM and no fake backend needed.
//
// The eight top-level IA sections per ADR 0049. `permissions: []` means
// "always visible, no gate" -- only Overview has this (Story 002: "Overview
// itself needs no permission of its own to exist as a destination").

export interface AdminSection {
	id: string
	label: string
	href: string
	/** Visible if the account holds ANY of these permissions -- not all. */
	permissions: string[]
	// Hiding an unbuilt section is a presentation rule, not a change to ADR
	// 0049's eight-section map: every section keeps its entry here, and the
	// story that builds a section's route sets its flag to true.
	/** True once the section has a route under src/routes/(admin); unbuilt sections are never shown. */
	built: boolean
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
	{ id: 'overview', label: 'Overview', href: '/', permissions: [], built: true },
	{
		id: 'applications',
		label: 'Applications',
		href: '/applications',
		permissions: ['applications:manage'],
		built: true,
	},
	{
		id: 'identity',
		label: 'Identity & Access',
		href: '/identity',
		permissions: ['identity:manage', 'contacts:read'],
		built: false,
	},
	{
		id: 'billing',
		label: 'Billing',
		href: '/billing',
		// ADR 0100 retires ADR 0090/0098's organization:manage/organization-
		// billing:manage catalog permissions -- org standing is a membership
		// role now (claims.organizationMemberships), not a tenant-wide
		// permissions grant, so it no longer belongs in this list. This
		// (admin) surface is tenant-staff-only by design (an ordinary org
		// manager is a customer, not tenant staff) -- the customer-facing
		// counterpart is the embeddable (embed) org-management surface.
		permissions: ['billing:read', 'billing:manage'],
		built: true,
	},
	{
		id: 'communications',
		label: 'Communications',
		href: '/communications',
		permissions: ['communications:manage'],
		built: false,
	},
	{
		id: 'analytics',
		label: 'Analytics',
		href: '/analytics',
		permissions: ['analytics:read'],
		built: false,
	},
	{
		id: 'privacy',
		label: 'Privacy & Compliance',
		href: '/privacy',
		permissions: ['privacy:manage', 'contacts:read'],
		built: false,
	},
	{
		id: 'settings',
		label: 'Settings',
		href: '/settings',
		permissions: ['settings:manage'],
		built: false,
	},
]

export function hasAnyPermission(granted: readonly string[], required: readonly string[]): boolean {
	if (required.length === 0) return true
	return required.some((permission) => granted.includes(permission))
}

/** Sections to show in nav -- built ones only, hidden not disabled, per Story 001. */
export function visibleSections(granted: readonly string[]): AdminSection[] {
	return ADMIN_SECTIONS.filter((section) => section.built && hasAnyPermission(granted, section.permissions))
}

/** Route-level guard backing the nav-level hiding for a given section id. */
export function canAccessSection(granted: readonly string[], sectionId: string): boolean {
	const section = ADMIN_SECTIONS.find((s) => s.id === sectionId)
	if (!section) return false
	return hasAnyPermission(granted, section.permissions)
}
