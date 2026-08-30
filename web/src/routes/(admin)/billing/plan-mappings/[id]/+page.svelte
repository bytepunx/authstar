<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const mapping = $derived(data.planMapping)
</script>

<h1 class="text-xl font-semibold">{mapping.name}</h1>
<p class="text-sm text-slate-500">
	Stripe price: <code>{mapping.stripePriceId}</code> ({mapping.unitAmount ?? '-'} {mapping.currency}/{mapping.interval}) --
	immutable; retire and create a new mapping to change it
</p>

{#if form?.formError}
	<p class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}
{#if form?.success}
	<p class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700" role="status">Saved.</p>
{/if}

<form method="POST" action="?/update" class="mt-4 flex max-w-xl flex-col gap-4">
	<label class="flex flex-col gap-1 text-sm">
		Name
		<input name="name" value={mapping.name} class="rounded border border-slate-300 px-2 py-1" />
		{#if form?.fieldErrors?.name}<span class="text-red-600">{form.fieldErrors.name}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Granted roles (application:role, comma-separated)
		<input
			name="grantedRoles"
			value={mapping.grantedRoles.map((r) => `${r.application}:${r.role}`).join(', ')}
			class="rounded border border-slate-300 px-2 py-1"
		/>
		{#if form?.fieldErrors?.grantedRoles}<span class="text-red-600">{form.fieldErrors.grantedRoles}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Seat limit (blank = unlimited, only meaningful for tenant-scoped subscriptions)
		<input name="seatLimit" type="number" value={mapping.seatLimit ?? ''} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Metered usage key (optional)
		<input name="meter" value={mapping.meter ?? ''} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		API key limit (blank = unlimited, 0 = disallow creating API keys)
		<input
			name="apiKeyLimit"
			type="number"
			min="0"
			value={mapping.apiKeyLimit ?? ''}
			class="rounded border border-slate-300 px-2 py-1"
		/>
	</label>

	<div class="flex flex-col gap-1 text-sm">
		API key rate limit (blank = none)
		<div class="flex gap-2">
			<input
				name="apiKeyRateLimitRequestsPerMinute"
				type="number"
				min="1"
				placeholder="requests / minute"
				value={mapping.apiKeyRateLimit?.requestsPerMinute ?? ''}
				class="w-1/2 rounded border border-slate-300 px-2 py-1"
			/>
			<input
				name="apiKeyRateLimitBurst"
				type="number"
				min="1"
				placeholder="burst (optional)"
				value={mapping.apiKeyRateLimit?.burst ?? ''}
				class="w-1/2 rounded border border-slate-300 px-2 py-1"
			/>
		</div>
		{#if form?.fieldErrors?.apiKeyRateLimitBurst}<span class="text-red-600"
				>{form.fieldErrors.apiKeyRateLimitBurst}</span
			>{/if}
	</div>

	<button type="submit" class="w-fit rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Save</button>
</form>

<section class="mt-8 max-w-xl">
	<h2 class="text-lg font-semibold">Retire</h2>
	<p class="text-sm text-slate-600">
		Stops this mapping from granting/revoking roles on future subscription events -- it is not permanently destroyed.
	</p>
	<form method="POST" action="?/retire" class="mt-2">
		<button type="submit" class="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700">Retire</button>
	</form>
</section>
