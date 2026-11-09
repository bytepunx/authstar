import { describe, expect, it } from 'vitest'
import { ADMIN_SECTIONS, canAccessSection, hasAnyPermission, visibleSections } from '../../src/lib/permissions'

// Story 001's section-gating table -- the shared logic both the nav's
// hiding and each section's own route guard read from.

describe('hasAnyPermission', () => {
	it('is true when the required list is empty (Overview: no permission needed to exist)', () => {
		expect(hasAnyPermission([], [])).toBe(true)
		expect(hasAnyPermission(['billing:read'], [])).toBe(true)
	})

	it('is true if the account holds ANY one of the required permissions, not all', () => {
		expect(hasAnyPermission(['billing:read'], ['billing:read', 'billing:manage'])).toBe(true)
	})

	it('is false if the account holds none of the required permissions', () => {
		expect(hasAnyPermission(['contacts:read'], ['billing:read', 'billing:manage'])).toBe(false)
	})
})

describe('visibleSections', () => {
	it('shows only Overview for an account with no permissions', () => {
		const sections = visibleSections([])
		expect(sections.map((s) => s.id)).toEqual(['overview'])
	})

	it('shows exactly one section for an account holding only that section\'s grant -- not disabled placeholders for the rest', () => {
		const sections = visibleSections(['applications:manage'])
		const ids = sections.map((s) => s.id)
		// Overview is always present too.
		expect(ids).toEqual(['overview', 'applications'])
	})

	it('shows only the built sections to an account holding every permission', () => {
		const every = ADMIN_SECTIONS.flatMap((s) => s.permissions)
		expect(visibleSections(every).map((s) => s.id)).toEqual(['overview', 'applications', 'billing'])
	})

	it('hides an unbuilt section even from an account holding its permission', () => {
		// contacts:read gates identity and privacy (ADR 0051/Story 008); neither
		// has a route yet, so neither is shown.
		const ids = visibleSections(['contacts:read']).map((s) => s.id)
		expect(ids).toEqual(['overview'])
		expect(ADMIN_SECTIONS.find((s) => s.id === 'identity')?.built).toBe(false)
		expect(ADMIN_SECTIONS.find((s) => s.id === 'privacy')?.built).toBe(false)
	})

	it('keeps all eight ADR 0049 sections in the table, built or not', () => {
		expect(ADMIN_SECTIONS.map((s) => s.id)).toEqual([
			'overview',
			'applications',
			'identity',
			'billing',
			'communications',
			'analytics',
			'privacy',
			'settings',
		])
	})

	it('never includes a section whose id is not in the fixed ADR 0049 table', () => {
		const sections = visibleSections(['applications:manage'])
		expect(sections.every((s) => ADMIN_SECTIONS.some((known) => known.id === s.id))).toBe(true)
	})
})

describe('canAccessSection', () => {
	it('grants access when the account holds the section\'s permission', () => {
		expect(canAccessSection(['applications:manage'], 'applications')).toBe(true)
	})

	it('denies access when the account lacks the section\'s permission', () => {
		expect(canAccessSection(['billing:read'], 'applications')).toBe(false)
	})

	it('denies access for an unknown section id rather than throwing', () => {
		expect(canAccessSection(['applications:manage'], 'nonexistent')).toBe(false)
	})

	it('grants access to overview unconditionally', () => {
		expect(canAccessSection([], 'overview')).toBe(true)
	})
})
