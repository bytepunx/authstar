<script lang="ts">
	import type { AdminSection } from '$lib/permissions'

	// Pure presentational component -- takes the already-computed visible
	// section list (never computes permission logic itself) so it can be
	// unit-tested (spec/components/nav.spec.ts) with a plain prop, no
	// session/backend fakery needed, and so +layout.server.ts stays the one
	// place `visibleSections()` is ever called.
	let { sections, currentPath }: { sections: AdminSection[]; currentPath: string } = $props()
</script>

<nav aria-label="Admin sections" class="flex flex-col gap-1 p-4">
	{#each sections as section (section.id)}
		<a
			href={section.href}
			data-testid={`nav-${section.id}`}
			aria-current={currentPath === section.href ? 'page' : undefined}
			class="rounded px-3 py-2 text-sm font-medium hover:bg-slate-100"
			class:bg-slate-200={currentPath === section.href}
		>
			{section.label}
		</a>
	{/each}
</nav>
