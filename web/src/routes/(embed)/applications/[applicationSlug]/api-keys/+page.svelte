<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
</script>

<h1 class="text-lg font-semibold authstar-embed-primary">API keys</h1>

{#if form?.formError}
	<p class="mt-3 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}

{#if form?.created}
	<div class="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
		<p class="font-semibold">Save this key now -- it will not be shown again.</p>
		<code class="mt-2 block break-all rounded bg-white p-2 text-xs">{form.created.secret}</code>
	</div>
{:else if form?.success}
	<p class="mt-3 rounded bg-green-50 p-3 text-sm text-green-700" role="status">Done.</p>
{/if}

{#if !data.canManage}
	<p class="mt-4 text-sm text-slate-500">
		This account does not currently have permission to create API keys for this application.
	</p>
{:else}
	<section class="mt-6">
		<h2 class="text-sm font-semibold text-slate-500">Your keys</h2>
		{#if data.keys.length === 0}
			<p class="mt-2 text-sm text-slate-500">No keys yet.</p>
		{:else}
			<ul class="mt-2 divide-y divide-slate-100 text-sm">
				{#each data.keys as key (key.apiKeyId)}
					<li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
						<span>
							<span class="font-medium">{key.name}</span>
							<code class="ml-1 text-xs text-slate-400">...{key.secretPreview}</code>
							{#if key.status === 'revoked'}
								<span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">revoked</span>
							{/if}
							{#each key.grantedRoles as role (role)}
								<span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{role}</span>
							{/each}
						</span>
						{#if key.status === 'active'}
							<form method="POST" action="?/revoke">
								<input type="hidden" name="apiKeyId" value={key.apiKeyId} />
								<button type="submit" class="text-xs text-red-600 underline">Revoke</button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-6 max-w-md">
		<h2 class="text-sm font-semibold text-slate-500">Create a new key</h2>
		<form method="POST" action="?/create" class="mt-2 flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-xs">
				Name
				<input name="name" required class="rounded border border-slate-300 px-2 py-1 text-sm" />
			</label>
			<fieldset class="flex flex-col gap-1 text-xs">
				<legend>Roles to grant this key</legend>
				{#each data.availableRoles as role (role)}
					<label class="flex items-center gap-2">
						<input type="checkbox" name="grantedRoles" value={role} />
						{role}
					</label>
				{/each}
			</fieldset>
			<button type="submit" class="w-fit rounded px-3 py-1.5 text-sm text-white authstar-embed-primary-bg">Create key</button>
		</form>
	</section>
{/if}
