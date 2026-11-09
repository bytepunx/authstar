import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import SubmitButton, { pendingSubmit } from '../../src/lib/components/SubmitButton.svelte'

// S-0011: a form's submit button shows the form is posting. While pending it
// is disabled (no double submit), aria-busy, and shows its pending label; idle
// it is a plain, enabled submit button with its own label.

const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }))

describe('SubmitButton.svelte', () => {
	it('renders an enabled submit button with its label when idle', () => {
		render(SubmitButton, { children: label('Save') })

		const button = screen.getByRole('button', { name: 'Save' })
		expect(button).toHaveAttribute('type', 'submit')
		expect(button).toBeEnabled()
		expect(button).not.toHaveAttribute('aria-busy')
	})

	it('is disabled, aria-busy, and shows the pending label while pending', () => {
		render(SubmitButton, { children: label('Save'), pending: true, pendingLabel: 'Saving...' })

		const button = screen.getByRole('button', { name: 'Saving...' })
		expect(button).toBeDisabled()
		expect(button).toHaveAttribute('aria-busy', 'true')
		expect(screen.queryByText('Save')).not.toBeInTheDocument()
	})

	it('falls back to a generic pending label', () => {
		render(SubmitButton, { children: label('Delete'), pending: true })

		expect(screen.getByRole('button', { name: 'Working...' })).toBeDisabled()
	})

	it('passes its class and other attributes through to the button', () => {
		render(SubmitButton, { children: label('Revoke'), class: 'text-red-600 underline', name: 'intent', value: 'revoke' })

		const button = screen.getByRole('button', { name: 'Revoke' })
		expect(button).toHaveClass('text-red-600', 'underline')
		expect(button).toHaveAttribute('name', 'intent')
		expect(button).toHaveAttribute('value', 'revoke')
	})
})

describe('pendingSubmit', () => {
	// SubmitFunction's input and result types are SvelteKit's; the tests need
	// only that it returns the callback enhance calls with `update`.
	type Callback = (opts: { update: () => Promise<void> }) => Promise<void>
	const start = (pending: Record<string, boolean>) =>
		(pendingSubmit(pending, 'save') as unknown as (input: unknown) => Callback)({})

	it('marks its key pending while the action runs and clears it once update() is done', async () => {
		const pending: Record<string, boolean> = {}
		const callback = start(pending)
		expect(pending.save).toBe(true)

		let updated = false
		await callback({ update: async () => void (updated = true) })
		expect(updated).toBe(true)
		expect(pending.save).toBe(false)
	})

	it('clears its key even when update() throws', async () => {
		const pending: Record<string, boolean> = {}
		const callback = start(pending)

		await expect(callback({ update: async () => Promise.reject(new Error('boom')) })).rejects.toThrow('boom')
		expect(pending.save).toBe(false)
	})
})
