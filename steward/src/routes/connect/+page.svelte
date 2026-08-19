<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { session } from '$lib/client/session.svelte.js'
  import type { ConnectResult } from '$lib/types.js'

  let token = $state('')
  let actorLabel = $state('')
  let submitting = $state(false)
  let errorMessage = $state<string | undefined>(undefined)
  let confirmedTowerUrl = $state<string | undefined>(undefined)

  // Story 001: "your session is no longer valid, reconnect" -- surfaced
  // here when api.ts redirects back after a 401 from any backend call.
  const expired = $derived(page.url.searchParams.get('reason') === 'expired')

  async function connect(event: SubmitEvent) {
    event.preventDefault()
    errorMessage = undefined
    submitting = true
    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const result = (await response.json()) as ConnectResult

      if (!result.ok) {
        errorMessage =
          result.reason === 'unreachable'
            ? "Can't reach tower. Check your port-forward and try again."
            : result.reason === 'invalid-token'
              ? 'That token was rejected. Check it and try again.'
              : (result.message ?? 'Something went wrong confirming this token.')
        return
      }

      confirmedTowerUrl = result.towerUrl
      session.connect(token, actorLabel, result.towerUrl)
      await goto('/tenants')
    } catch (err) {
      errorMessage = "Can't reach tower. Check your port-forward and try again."
    } finally {
      submitting = false
    }
  }
</script>

<h1>Connect</h1>

{#if expired}
  <p class="warning" role="alert">Your session is no longer valid. Please reconnect.</p>
{/if}

<form onsubmit={connect}>
  <label>
    Operator bearer token
    <input type="password" name="token" bind:value={token} required autocomplete="off" />
  </label>

  <label>
    Acting as
    <input type="text" name="actorLabel" bind:value={actorLabel} required placeholder="your name or handle" />
  </label>

  <button type="submit" disabled={submitting || !token || !actorLabel}>
    {submitting ? 'Connecting...' : 'Connect'}
  </button>
</form>

{#if errorMessage}
  <p class="error" role="alert">{errorMessage}</p>
{/if}

{#if confirmedTowerUrl}
  <p class="confirmation">
    Connected to <code>{confirmedTowerUrl}</code>
  </p>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 24rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .error {
    color: #b00020;
  }
  .warning {
    color: #9a6700;
  }
</style>
