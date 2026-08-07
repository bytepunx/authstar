// Steward has no server-side session (Story 001: "no cookie, no
// server-side session record at all") -- the operator bearer token lives
// only in the browser's sessionStorage. There is nothing useful for SSR to
// render on any authenticated route (it would always render the
// signed-out state), so steward renders as a client-rendered app after the
// initial shell; only the `/api/**` proxy endpoints run server-side per
// request.
export const ssr = false
