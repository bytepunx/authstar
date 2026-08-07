<script lang="ts">
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()
</script>

<div class="flex min-h-screen flex-col items-center justify-center gap-6">
	{#if data.branding.logoUrl}
		<img src={data.branding.logoUrl} alt={data.branding.productName} class="h-10" />
	{:else}
		<h1 class="text-2xl font-semibold">{data.branding.productName}</h1>
	{/if}

	<div class="flex w-full max-w-xs flex-col gap-3" data-testid="provider-list">
		{#if data.providers.length === 0}
			<p class="text-sm text-slate-500">No sign-in providers are configured for this application.</p>
		{/if}
		{#each data.providers as provider (provider.name)}
			<a
				href={provider.loginPath}
				data-testid={`provider-${provider.name}`}
				class="rounded border border-slate-300 px-4 py-2 text-center text-sm hover:border-slate-500"
			>
				Continue with {provider.label}
			</a>
		{/each}
	</div>
</div>
