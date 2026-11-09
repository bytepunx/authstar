<script lang="ts">
	import { page } from '$app/state'

	// Root error page for every route group: (admin), (embed), and (hosted).
	// It renders inside the root layout only, so it assumes neither the admin
	// nav nor a session. It shows a fixed, plain message per status and never
	// `page.error.message`, which for an unexpected error could carry internal
	// detail; upstream failures arrive here as the 502 that
	// src/lib/server/upstream-error.ts throws.
	const messages: Record<number, { title: string; detail: string }> = {
		403: {
			title: 'No access',
			detail: 'Your account does not have access to this page.',
		},
		404: {
			title: 'Page not found',
			detail: 'This page does not exist.',
		},
		502: {
			title: 'Service unavailable',
			detail: 'A service this page depends on did not respond. Try again in a moment.',
		},
		503: {
			title: 'Service unavailable',
			detail: 'A service this page depends on did not respond. Try again in a moment.',
		},
	}

	const fallback = {
		title: 'Something went wrong',
		detail: 'The page could not be shown. Try again in a moment.',
	}

	const message = $derived(messages[page.status] ?? fallback)
</script>

<svelte:head>
	<title>{message.title}</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6">
	<p class="text-sm font-medium text-slate-500" data-testid="error-status">Error {page.status}</p>
	<h1 class="text-2xl font-semibold" data-testid="error-title">{message.title}</h1>
	<p class="text-slate-700" data-testid="error-detail">{message.detail}</p>
	<div class="flex gap-3">
		<a
			href="/"
			data-testid="error-home"
			class="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
		>
			Go to the home page
		</a>
		<button
			type="button"
			data-testid="error-back"
			onclick={() => history.back()}
			class="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
		>
			Go back
		</button>
	</div>
</main>
