<script lang="ts">
	import type { ActionData } from './$types'

	let { form }: { form: ActionData } = $props()
</script>

<h1 class="text-xl font-semibold">New plan mapping</h1>

{#if form?.formError}
	<p class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}

<form method="POST" class="mt-4 flex max-w-xl flex-col gap-4">
	<label class="flex flex-col gap-1 text-sm">
		Stripe price ID
		<input
			name="stripePriceId"
			value={form?.values?.stripePriceId ?? ''}
			class="rounded border border-slate-300 px-2 py-1"
		/>
		{#if form?.fieldErrors?.stripePriceId}<span class="text-red-600">{form.fieldErrors.stripePriceId}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Name
		<input name="name" value={form?.values?.name ?? ''} class="rounded border border-slate-300 px-2 py-1" />
		{#if form?.fieldErrors?.name}<span class="text-red-600">{form.fieldErrors.name}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Granted roles (application:role, comma-separated)
		<input
			name="grantedRoles"
			value={form?.values?.grantedRoles ?? ''}
			placeholder="loci:plan:family, loci:plan:business"
			class="rounded border border-slate-300 px-2 py-1"
		/>
		{#if form?.fieldErrors?.grantedRoles}<span class="text-red-600">{form.fieldErrors.grantedRoles}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Seat limit (blank = unlimited, only meaningful for tenant-scoped subscriptions)
		<input
			name="seatLimit"
			type="number"
			value={form?.values?.seatLimit ?? ''}
			class="rounded border border-slate-300 px-2 py-1"
		/>
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Metered usage key (optional)
		<input name="meter" value={form?.values?.meter ?? ''} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		API key limit (blank = unlimited, 0 = disallow creating API keys)
		<input
			name="apiKeyLimit"
			type="number"
			min="0"
			value={form?.values?.apiKeyLimit ?? ''}
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
				value={form?.values?.apiKeyRateLimitRequestsPerMinute ?? ''}
				class="w-1/2 rounded border border-slate-300 px-2 py-1"
			/>
			<input
				name="apiKeyRateLimitBurst"
				type="number"
				min="1"
				placeholder="burst (optional)"
				value={form?.values?.apiKeyRateLimitBurst ?? ''}
				class="w-1/2 rounded border border-slate-300 px-2 py-1"
			/>
		</div>
		{#if form?.fieldErrors?.apiKeyRateLimitBurst}<span class="text-red-600"
				>{form.fieldErrors.apiKeyRateLimitBurst}</span
			>{/if}
	</div>

	<button type="submit" class="w-fit rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Create</button>
</form>
