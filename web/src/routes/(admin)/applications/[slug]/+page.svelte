<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const app = $derived(data.application)
</script>

<h1 class="text-xl font-semibold">{app.name}</h1>
<p class="text-sm text-slate-500">slug: {app.slug} (immutable)</p>

{#if form?.formError}
	<p class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}
{#if form?.success}
	<p class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700" role="status">Saved.</p>
{/if}

<form method="POST" action="?/update" class="mt-4 flex max-w-xl flex-col gap-4">
	<label class="flex flex-col gap-1 text-sm">
		Name
		<input name="name" value={app.name} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Hosts (comma-separated)
		<input name="hosts" value={app.hosts.join(', ')} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Primary host
		<input name="primaryHost" value={app.primaryHost} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Upstream base URL
		<input
			name="upstreamBaseUrl"
			value={app.upstream.baseUrl}
			class="rounded border border-slate-300 px-2 py-1"
		/>
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Upstream prefix routes (comma-separated)
		<input
			name="prefixRoutes"
			value={app.upstream.prefixRoutes.join(', ')}
			class="rounded border border-slate-300 px-2 py-1"
		/>
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Upstream timeout (seconds)
		<input name="timeout" type="number" value={app.upstream.timeout} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		CORS allowed origins (comma-separated)
		<input
			name="allowedOrigins"
			value={app.cors.allowedOrigins.join(', ')}
			class="rounded border border-slate-300 px-2 py-1"
		/>
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Exempt paths (comma-separated)
		<input name="exemptPaths" value={app.exemptPaths.join(', ')} class="rounded border border-slate-300 px-2 py-1" />
	</label>

	<label class="flex flex-col gap-1 text-sm">
		Login URL (read-only)
		<input value={app.loginUrl} disabled class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-500" />
	</label>

	<fieldset class="flex flex-col gap-1 text-sm">
		<legend>Exposed providers</legend>
		{#each data.providers as provider (provider.name)}
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					name="exposedProviders"
					value={provider.name}
					checked={app.exposedProviders.includes(provider.name)}
				/>
				{provider.label}
			</label>
		{/each}
	</fieldset>

	<button type="submit" class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Save</button>
</form>

<section class="mt-8 max-w-xl">
	<h2 class="text-lg font-semibold">Usage-reporting credentials</h2>
	{#if form?.issuedCredential}
		<div class="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm" role="alert">
			<p class="font-medium">Save this secret now -- you won't see it again.</p>
			<code class="mt-1 block break-all">{form.issuedCredential.secret}</code>
		</div>
	{/if}
	<ul class="mt-2 divide-y divide-slate-100 text-sm">
		{#each app.usageCredentials as credential (credential.credentialId)}
			<li class="flex items-center justify-between py-2">
				<span>{credential.credentialId} -- {credential.status} -- {credential.createdAt}</span>
				{#if credential.status === 'active'}
					<form method="POST" action="?/revokeCredential">
						<input type="hidden" name="credentialId" value={credential.credentialId} />
						<button type="submit" class="text-red-600 underline">Revoke</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
	<form method="POST" action="?/issueCredential" class="mt-2">
		<button type="submit" class="rounded border border-slate-300 px-3 py-1.5 text-sm">Issue new credential</button>
	</form>
</section>

<section class="mt-8 max-w-xl">
	<h2 class="text-lg font-semibold">Deactivate</h2>
	<p class="text-sm text-slate-600">This deactivates the application -- it is not permanently destroyed.</p>
	<form method="POST" action="?/delete" class="mt-2">
		<button type="submit" class="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700">Delete</button>
	</form>
</section>
