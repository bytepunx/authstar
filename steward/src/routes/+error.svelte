<script lang="ts">
  import { page } from '$app/state'
  import { session } from '#lib/client/session.svelte.js'

  // A plain message per status. The error's own message is never shown:
  // it can carry a stack trace or an upstream response body.
  const message = $derived.by(() => {
    const status = page.status
    if (status === 404) return 'This page does not exist.'
    if (status === 401 || status === 403) return 'Your session cannot open this page.'
    if (status === 502 || status === 503 || status === 504) return 'A service steward depends on did not answer. Try again shortly.'
    return 'Something went wrong.'
  })

  // Connected operators go back to Tenant Search; anyone else to Connect.
  const back = $derived(
    session.connected
      ? { href: '/tenants', label: 'Back to tenants' }
      : { href: '/connect', label: 'Back to Connect' },
  )
</script>

<h1>Error {page.status}</h1>

<p role="alert">{message}</p>

<p><a href={back.href}>{back.label}</a></p>
