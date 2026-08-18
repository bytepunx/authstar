<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()
</script>

<div class="flex items-center justify-between">
	<h1 class="text-xl font-semibold">Organizations</h1>
</div>
<p class="mt-1 text-sm text-slate-500">
	Customer accounts sharing one subscription. An organization is created by its own first
	manager, not from here -- this is a read/manage surface for organizations that already exist.
</p>

{#if data.organizations.length === 0}
	<p class="mt-4 text-sm text-slate-600">No organizations yet.</p>
{:else}
	<table class="mt-4 w-full text-left text-sm">
		<thead>
			<tr class="border-b border-slate-200 text-slate-500">
				<th class="py-2">Name</th>
				<th class="py-2">Managers</th>
			</tr>
		</thead>
		<tbody>
			{#each data.organizations as org (org.organizationId)}
				<tr class="border-b border-slate-100" data-testid={`organization-row-${org.organizationId}`}>
					<td class="py-2">
						<a href={`/billing/organizations/${org.organizationId}`} class="text-slate-900 underline">{org.name}</a>
					</td>
					<td class="py-2">{org.managers.length}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
