<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { LayoutData } from './$types'

	let { data, children }: { data: LayoutData; children: Snippet } = $props()

	const styleVars = $derived(
		[
			data.theme.primaryColor ? `--authstar-embed-primary: ${data.theme.primaryColor};` : '',
			data.theme.fontFamily ? `--authstar-embed-font: ${data.theme.fontFamily};` : '',
		]
			.filter(Boolean)
			.join(' '),
	)
</script>

<!-- Same deliberately-chrome-free shell as `(embed)/organizations/[organizationId]`'s own layout. -->
<div
	class="min-h-screen p-4"
	style="font-family: var(--authstar-embed-font, inherit); {styleVars}"
>
	{@render children()}
</div>

<style>
	:global(.authstar-embed-primary) {
		color: var(--authstar-embed-primary, #0f172a);
	}
	:global(.authstar-embed-primary-bg) {
		background-color: var(--authstar-embed-primary, #0f172a);
	}
	:global(.authstar-embed-primary-border) {
		border-color: var(--authstar-embed-primary, #0f172a);
	}
</style>
