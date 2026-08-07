import { describe, expect, it, vi } from 'vitest'
import { submitSignup, validateSignupInput } from '../../src/lib/signup'

// Story 010's public signup page has no +page.server.ts (the browser calls
// tower directly, the one place in this whole design that happens) -- so
// its contract test targets the pure `submitSignup` function the page
// component wires to a real `<form>`, with a fake `fetch` standing in for
// the browser-to-tower call.

describe('validateSignupInput', () => {
	it('requires name, a slug-shaped slug, and a valid email', () => {
		const errors = validateSignupInput({ name: '', slug: 'Not Valid!', adminEmail: 'not-an-email' })
		expect(errors.name).toBeDefined()
		expect(errors.slug).toBeDefined()
		expect(errors.adminEmail).toBeDefined()
	})

	it('accepts a well-formed input', () => {
		expect(validateSignupInput({ name: 'Acme', slug: 'acme', adminEmail: 'admin@acme.example.com' })).toEqual({})
	})
})

describe('submitSignup', () => {
	const validInput = { name: 'Acme', slug: 'acme', adminEmail: 'admin@acme.example.com' }

	it('never calls fetch when validation fails', async () => {
		const fetchImpl = vi.fn()
		const result = await submitSignup(fetchImpl, 'http://tower.local', { ...validInput, slug: 'Bad Slug!' })
		expect(result.outcome).toBe('validation-error')
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it('posts directly to tower\'s public /tenants ingress with no adminHost field', async () => {
		const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string)
			expect(body).toEqual(validInput)
			expect(body.adminHost).toBeUndefined()
			return new Response(null, { status: 201 })
		})

		const result = await submitSignup(fetchImpl, 'http://tower.local', validInput)

		expect(result.outcome).toBe('success')
		expect(fetchImpl).toHaveBeenCalledWith('http://tower.local/tenants', expect.objectContaining({ method: 'POST' }))
	})

	it('on failure, guides the user to retry the SAME slug, not start over', async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }))
		const result = await submitSignup(fetchImpl, 'http://tower.local', validInput)
		expect(result.outcome).toBe('retry-same-slug')
		if (result.outcome === 'retry-same-slug') {
			expect(result.message).toContain(validInput.slug)
		}
	})
})
