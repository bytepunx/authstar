<script lang="ts">
	import Nav from '$lib/components/Nav.svelte'
	import type { Snippet } from 'svelte'
	import type { LayoutData } from './$types'

	let { data, children }: { data: LayoutData; children: Snippet } = $props()
</script>

<div class="flex min-h-screen">
	<aside class="w-56 shrink-0 border-r border-slate-200">
		<div class="p-4 text-lg font-semibold">authstar</div>
		<Nav sections={data.sections} currentPath={data.currentPath} />
	</aside>
	<main class="flex-1 p-6">
		{@render children()}
	</main>
</div>
