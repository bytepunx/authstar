<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()
</script>

<div class="flex items-center justify-between">
	<h1 class="text-xl font-semibold">Applications</h1>
	<a href="/applications/new" class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">New application</a>
</div>

{#if data.applications.length === 0}
	<p class="mt-4 text-sm text-slate-600">No applications yet.</p>
{:else}
	<table class="mt-4 w-full text-left text-sm">
		<thead>
			<tr class="border-b border-slate-200 text-slate-500">
				<th class="py-2">Slug</th>
				<th class="py-2">Name</th>
				<th class="py-2">Hosts</th>
				<th class="py-2">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each data.applications as app (app.slug)}
				<tr class="border-b border-slate-100" data-testid={`application-row-${app.slug}`}>
					<td class="py-2">
						<a href={`/applications/${app.slug}`} class="text-slate-900 underline">{app.slug}</a>
					</td>
					<td class="py-2">{app.name}</td>
					<td class="py-2">{app.hosts.join(', ')}</td>
					<td class="py-2">{app.status}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
