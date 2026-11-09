import { describe, expect, it } from 'vitest'
import { load } from '../../src/routes/(admin)/+layout.server'
import { ADMIN_SECTIONS } from '../../src/lib/permissions'
import { fakeSession } from '../fixtures/fake-session'

// Behavior tier: the (admin) layout's load is what both the nav and the
// Overview tiles read `sections` from, so a section it leaves out appears in
// neither. Called directly with a hand-built event, per TESTING.md.

type LayoutResult = { sections: { id: string }[] }

async function sectionIds(permissions: string[]): Promise<string[]> {
	const result = (await load({
		locals: { session: fakeSession({ permissions }) },
		url: new URL('http://acme.example.com/'),
	} as unknown as Parameters<typeof load>[0])) as LayoutResult
	return result.sections.map((s) => s.id)
}

describe('(admin) layout load -- sections', () => {
	it('returns only built sections to an account holding every permission', async () => {
		const every = ADMIN_SECTIONS.flatMap((s) => s.permissions)
		expect(await sectionIds(every)).toEqual(['overview', 'applications', 'billing'])
	})

	it('returns no unbuilt section, whatever the account holds', async () => {
		const unbuilt = ADMIN_SECTIONS.filter((s) => !s.built)
		const ids = await sectionIds(unbuilt.flatMap((s) => s.permissions))
		expect(ids).toEqual(['overview'])
	})
})
