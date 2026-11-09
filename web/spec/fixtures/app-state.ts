// Stand-in for SvelteKit's `$app/state` in the jsdom component tier, which runs
// without SvelteKit's Vite plugin; specs replace it with vi.mock.
export const page = { status: 200, error: null as { message: string } | null }
