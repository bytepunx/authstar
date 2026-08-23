<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()
</script>

<div class="flex items-center justify-between">
	<h1 class="text-xl font-semibold">Plan mappings</h1>
	<a href="/billing/plan-mappings/new" class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
		New plan mapping
	</a>
</div>
<p class="mt-1 text-sm text-slate-500">
	Maps a Stripe price to the role(s) it grants -- this is what keep's webhook handler consults to
	know what to grant or revoke as a subscription's status changes.
</p>

{#if data.planMappings.length === 0}
	<p class="mt-4 text-sm text-slate-600">No plan mappings yet.</p>
{:else}
	<table class="mt-4 w-full text-left text-sm">
		<thead>
			<tr class="border-b border-slate-200 text-slate-500">
				<th class="py-2">Name</th>
				<th class="py-2">Stripe price</th>
				<th class="py-2">Granted roles</th>
				<th class="py-2">Seat limit</th>
				<th class="py-2"></th>
			</tr>
		</thead>
		<tbody>
			{#each data.planMappings as mapping (mapping.id)}
				<tr class="border-b border-slate-100" data-testid={`plan-mapping-row-${mapping.id}`}>
					<td class="py-2">{mapping.name}</td>
					<td class="py-2"><code>{mapping.stripePriceId}</code></td>
					<td class="py-2">
						{mapping.grantedRoles.map((r) => `${r.application}:${r.role}`).join(', ') || '-'}
					</td>
					<td class="py-2">{mapping.seatLimit ?? '-'}</td>
					<td class="py-2">
						<form method="POST" action="?/retire">
							<input type="hidden" name="id" value={mapping.id} />
							<button type="submit" class="text-sm text-red-700 underline">Retire</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
