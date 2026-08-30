<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { LayoutData } from './$types'

	let { data, children }: { data: LayoutData; children: Snippet } = $props()

	// The theming contract: a small, explicit set of CSS custom properties
	// a host app's own embed URL can set via `?primaryColor=`/`?fontFamily=`
	// -- everything in this surface that wants to pick up branding reads
	// these variables, never a hardcoded color/font. Falls back to sane
	// defaults when unset (or the query param failed validation server-side).
	const styleVars = $derived(
		[
			data.theme.primaryColor ? `--authstar-embed-primary: ${data.theme.primaryColor};` : '',
			data.theme.fontFamily ? `--authstar-embed-font: ${data.theme.fontFamily};` : '',
		]
			.filter(Boolean)
			.join(' '),
	)
</script>

<!--
	Deliberately no site nav/sidebar/header here (unlike (admin)'s own
	layout) -- this is meant to read naturally inside a tenant app's own
	iframe, not as a standalone page with authstar's own chrome around it.
-->
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
