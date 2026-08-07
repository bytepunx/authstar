<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
</script>

<h1 class="text-xl font-semibold">New application</h1>

{#if form?.formError}
	<p class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}

<form method="POST" class="mt-4 flex max-w-xl flex-col gap-4">
	<label class="flex flex-col gap-1 text-sm">
		Slug
		<input name="slug" value={form?.values?.slug ?? ''} class="rounded border border-slate-300 px-2 py-1" />
		{#if form?.fieldErrors?.slug}<span class="text-red-600">{form.fieldErrors.slug}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Name
		<input name="name" value={form?.values?.name ?? ''} class="rounded border border-slate-300 px-2 py-1" />
		{#if form?.fieldErrors?.name}<span class="text-red-600">{form.fieldErrors.name}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Hosts (comma-separated)
		<input name="hosts" value={form?.values?.hosts ?? ''} class="rounded border border-slate-300 px-2 py-1" />
		{#if form?.fieldErrors?.hosts}<span class="text-red-600">{form.fieldErrors.hosts}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Primary host
		<input
			name="primaryHost"
			value={form?.values?.primaryHost ?? ''}
			class="rounded border border-slate-300 px-2 py-1"
		/>
		{#if form?.fieldErrors?.primaryHost}<span class="text-red-600">{form.fieldErrors.primaryHost}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Upstream base URL
		<input
			name="upstreamBaseUrl"
			value={form?.values?.upstreamBaseUrl ?? ''}
			class="rounded border border-slate-300 px-2 py-1"
		/>
		{#if form?.fieldErrors?.upstreamBaseUrl}<span class="text-red-600">{form.fieldErrors.upstreamBaseUrl}</span>{/if}
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Upstream prefix routes (comma-separated)
		<input name="prefixRoutes" class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Upstream timeout (seconds)
		<input name="timeout" type="number" value="30" class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		CORS allowed origins (comma-separated)
		<input name="allowedOrigins" class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Exempt paths (comma-separated)
		<input name="exemptPaths" class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<fieldset class="flex flex-col gap-1 text-sm">
		<legend>Exposed providers</legend>
		{#each data.providers as provider (provider.name)}
			<label class="flex items-center gap-2">
				<input type="checkbox" name="exposedProviders" value={provider.name} />
				{provider.label}
			</label>
		{/each}
	</fieldset>

	<button type="submit" class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Create</button>
</form>
