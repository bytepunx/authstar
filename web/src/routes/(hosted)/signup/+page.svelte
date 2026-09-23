<script lang="ts">
	import { env } from '$env/dynamic/public'
	import { submitSignup, type SignupResult } from '$lib/signup'

	// `$env/dynamic/public` (not `/static`) deliberately -- static public env
	// vars must be defined at *build* time or the build fails outright; this
	// page's tower URL varies by deployment (ADR: signup is reachable at a
	// fixed non-tenant host, tower's own public ingress address isn't known
	// at image-build time) and has a safe local-dev fallback below.
	const towerBaseUrl = env.PUBLIC_TOWER_BASE_URL ?? 'http://localhost:3000'

	let name = $state('')
	let slug = $state('')
	let adminEmail = $state('')
	let result = $state<SignupResult | null>(null)
	let submitting = $state(false)

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		submitting = true
		try {
			result = await submitSignup(fetch, towerBaseUrl, { name, slug, adminEmail })
		} finally {
			submitting = false
		}
	}
</script>

<div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4">
	<h1 class="text-2xl font-semibold">Create your account</h1>

	{#if result?.outcome === 'success'}
		<p class="rounded bg-green-50 p-3 text-sm text-green-800" role="status">
			Check your email to finish setting up your account.
		</p>
	{:else}
		{#if result?.outcome === 'retry-same-slug'}
			<p class="rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{result.message}</p>
		{/if}

		<form class="flex flex-col gap-3" onsubmit={handleSubmit}>
			<label class="flex flex-col gap-1 text-sm">
				Organization name
				<input bind:value={name} name="name" class="rounded border border-slate-300 px-2 py-1" />
				{#if result?.outcome === 'validation-error' && result.fieldErrors.name}
					<span class="text-red-600">{result.fieldErrors.name}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-1 text-sm">
				Slug
				<input bind:value={slug} name="slug" class="rounded border border-slate-300 px-2 py-1" />
				{#if result?.outcome === 'validation-error' && result.fieldErrors.slug}
					<span class="text-red-600">{result.fieldErrors.slug}</span>
				{/if}
			</label>

			<label class="flex flex-col gap-1 text-sm">
				Admin email
				<input bind:value={adminEmail} name="adminEmail" type="email" class="rounded border border-slate-300 px-2 py-1" />
				{#if result?.outcome === 'validation-error' && result.fieldErrors.adminEmail}
					<span class="text-red-600">{result.fieldErrors.adminEmail}</span>
				{/if}
			</label>

			<button type="submit" disabled={submitting} class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
				{submitting ? 'Creating...' : 'Create account'}
			</button>
		</form>
	{/if}
</div>
