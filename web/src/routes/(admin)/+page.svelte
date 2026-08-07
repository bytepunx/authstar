<script lang="ts">
	import type { PageData } from './$types'

	// Story 002 (Overview)'s three permission-gated tiles (Active Users,
	// Revenue Summary, Recent Activity -- each its own chronicle/keep/merged-
	// activity backend call) are explicitly deferred for this slice; see
	// TESTING.md. This route stays a real, reachable landing page -- per
	// Story 002, Overview itself needs no permission to exist as a
	// destination -- rather than a placeholder that would make the
	// (admin) layout's own guard untestable end to end.
	let { data }: { data: PageData } = $props()
</script>

<h1 class="text-xl font-semibold">Overview</h1>
<p class="mt-2 text-sm text-slate-600">Signed in to <strong>{data.session.tenantSlug}</strong>.</p>

<ul class="mt-6 grid grid-cols-2 gap-4">
	{#each data.sections.filter((s) => s.id !== 'overview') as section (section.id)}
		<li>
			<a href={section.href} class="block rounded border border-slate-200 p-4 hover:border-slate-400">
				{section.label}
			</a>
		</li>
	{/each}
</ul>
