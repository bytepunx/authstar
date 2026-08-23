<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
</script>

<h1 class="text-xl font-semibold">Stripe configuration</h1>
<p class="mt-1 text-sm text-slate-500">
	Connects this tenant's own Stripe account so plan mappings and webhooks can work. Write-only --
	once set, the secret key and webhook signing secret are never shown again, only whether a
	configuration currently exists.
</p>

<p class="mt-4 text-sm">
	Status:
	{#if data.configured}
		<span class="text-emerald-700">configured</span>
	{:else}
		<span class="text-slate-500">not configured</span>
	{/if}
</p>

{#if form?.success}
	<p class="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700" role="status">
		Stripe configuration saved.
	</p>
{/if}
{#if form?.formError}
	<p class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}

<form method="POST" class="mt-4 flex max-w-xl flex-col gap-4">
	<label class="flex flex-col gap-1 text-sm">
		Stripe secret key
		<input name="secretKey" type="password" class="rounded border border-slate-300 px-2 py-1" />
		{#if form?.fieldErrors?.secretKey}<span class="text-red-600">{form.fieldErrors.secretKey}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Webhook signing secret
		<input name="webhookSecret" type="password" class="rounded border border-slate-300 px-2 py-1" />
		{#if form?.fieldErrors?.webhookSecret}<span class="text-red-600">{form.fieldErrors.webhookSecret}</span>{/if}
	</label>

	<button type="submit" class="w-fit rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
		{data.configured ? 'Update' : 'Save'}
	</button>
</form>
