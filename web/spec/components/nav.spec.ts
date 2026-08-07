import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import Nav from '../../src/lib/components/Nav.svelte'
import { visibleSections } from '../../src/lib/permissions'

// Story 001: sections are hidden, not merely disabled, when the account
// lacks a relevant grant. Nav.svelte is a pure presentational component
// (permission logic lives in permissions.ts, tested separately) -- this
// test is about what actually reaches the rendered DOM, via
// @testing-library/svelte rather than a full route render.

describe('Nav.svelte', () => {
	it('renders only the sections it is given -- an account with one grant sees one non-Overview link', () => {
		const sections = visibleSections(['applications:manage'])
		render(Nav, { sections, currentPath: '/' })

		expect(screen.getByTestId('nav-overview')).toBeInTheDocument()
		expect(screen.getByTestId('nav-applications')).toBeInTheDocument()
		expect(screen.queryByTestId('nav-billing')).not.toBeInTheDocument()
		expect(screen.queryByTestId('nav-settings')).not.toBeInTheDocument()
	})

	it('marks the current path with aria-current="page"', () => {
		const sections = visibleSections(['applications:manage'])
		render(Nav, { sections, currentPath: '/applications' })

		expect(screen.getByTestId('nav-applications')).toHaveAttribute('aria-current', 'page')
		expect(screen.getByTestId('nav-overview')).not.toHaveAttribute('aria-current')
	})
})
