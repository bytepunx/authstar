<script lang="ts">
  // Story 004 -- Stuck Erasure Requests, steward's first cross-tenant view
  // (ADR 0075). A top-level view beside Tenant Search, not reached from a
  // tenant's context. The threshold is the operator's control: changing it
  // re-queries tower, since it changes which requests tower returns. Rows
  // are grouped by the service that has not acknowledged them, because the
  // usual pattern is one service that stopped consuming its queue in every
  // tenant; a request with several outstanding services appears under each.
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { session } from '#lib/client/session.svelte.js'
  import { apiCall, ApiError } from '#lib/client/api.js'
  import type { StuckErasureRequest } from '#lib/types.js'
  import StuckErasureRows from '#lib/components/StuckErasureRows.svelte'

  const DEFAULT_OLDER_THAN_HOURS = 72

  let olderThanHours = $state<number | null>(DEFAULT_OLDER_THAN_HOURS)
  let requests = $state<StuckErasureRequest[]>([])
  let loading = $state(false)
  let loadError = $state<string | undefined>(undefined)
  // Each query's number: a slower, older answer never overwrites a newer one.
  let latestQuery = 0

  const groups = $derived.by(() => {
    const byService = new Map<string, StuckErasureRequest[]>()
    for (const request of requests) {
      for (const service of request.outstandingServices) {
        const group = byService.get(service) ?? []
        group.push(request)
        byService.set(service, group)
      }
    }
    return [...byService.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([service, rows]) => ({ service, rows }))
  })

  onMount(() => {
    if (!session.connected) {
      goto('/connect')
      return
    }
    void loadStuck()
  })

  async function loadStuck() {
    const hours = olderThanHours
    if (hours === null || !Number.isSafeInteger(hours) || hours <= 0) {
      loadError = 'Enter a positive whole number of hours.'
      requests = []
      return
    }
    const query = ++latestQuery
    loading = true
    loadError = undefined
    try {
      const result = await apiCall<StuckErasureRequest[]>(`/api/erasure-requests/stuck?olderThanHours=${hours}`)
      if (query === latestQuery) requests = result
    } catch (err) {
      if (query === latestQuery) {
        requests = []
        loadError = err instanceof ApiError ? err.message : 'Failed to load stuck erasure requests.'
      }
    } finally {
      if (query === latestQuery) loading = false
    }
  }

  function applyThreshold(event: SubmitEvent) {
    event.preventDefault()
    void loadStuck()
  }
</script>

<h1>Stuck Erasure Requests</h1>

<p>Erasure requests, across every tenant, that some service has not acknowledged within the threshold.</p>

<!-- novalidate: steward's own check refuses a bad threshold with an alert,
     so the browser's validation bubble does not hide it. -->
<form onsubmit={applyThreshold} novalidate>
  <label>
    Older than (hours)
    <input type="number" min="1" step="1" bind:value={olderThanHours} />
  </label>
  <button type="submit">Apply</button>
</form>

<section>
  <h2>By outstanding service</h2>

  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {/if}

  {#if loading}
    <p>Loading...</p>
  {:else}
    {#each groups as group (group.service)}
      <section class="service-group">
        <h3>{group.service}</h3>
        <StuckErasureRows requests={group.rows} />
      </section>
    {:else}
      <p>No stuck erasure requests.</p>
    {/each}
  {/if}
</section>

<style>
  .error { color: #b00020; }
</style>
