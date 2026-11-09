<script module lang="ts">
	import type { SubmitFunction } from '$app/forms'

	/** A `use:enhance` submit function that marks `pending[key]` while the form's action runs. */
	export function pendingSubmit(pending: Record<string, boolean>, key: string): SubmitFunction {
		return () => {
			pending[key] = true
			return async ({ update }) => {
				try {
					await update()
				} finally {
					pending[key] = false
				}
			}
		}
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { HTMLButtonAttributes } from 'svelte/elements'

	// A form's submit button that shows the form is posting: while `pending`
	// it is disabled, marked aria-busy, and shows `pendingLabel` in place of
	// its children. Without JavaScript `pending` never turns true, so the
	// button behaves as a plain submit button.
	let {
		pending = false,
		pendingLabel = 'Working...',
		disabled = false,
		class: className = '',
		children,
		...rest
	}: HTMLButtonAttributes & { pending?: boolean; pendingLabel?: string; children: Snippet } = $props()
</script>

<button
	{...rest}
	type="submit"
	class="{className} disabled:cursor-wait disabled:opacity-60"
	disabled={pending || disabled}
	aria-busy={pending ? 'true' : undefined}
>
	{#if pending}{pendingLabel}{:else}{@render children()}{/if}
</button>
