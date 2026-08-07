<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { session } from '$lib/client/session.svelte.js'
  import { apiCall, ApiError } from '$lib/client/api.js'
  import type { CreateTenantErrorBody, CreateTenantRequest, CreateTenantResponse, Tenant, TenantListResponse } from '$lib/types.js'

  let search = $state('')
  let tenants = $state<Tenant[]>([])
  let loading = $state(false)
  let loadError = $state<string | undefined>(undefined)
  let reactivating = $state<string | undefined>(undefined)

  let showCreate = $state(false)
  let createSlug = $state('')
  let createName = $state('')
  let createAdminEmail = $state('')
  let createAdminHost = $state('')
  let creating = $state(false)
  let createError = $state<string | undefined>(undefined)
  let createResult = $state<CreateTenantResponse | undefined>(undefined)

  onMount(() => {
    if (!session.connected) {
      goto('/connect')
      return
    }
    void search_tenants()
  })

  async function search_tenants() {
    loading = true
    loadError = undefined
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : ''
      const result = await apiCall<TenantListResponse>(`/api/tenants${query}`)
      tenants = result.items
    } catch (err) {
      if (err instanceof ApiError) loadError = err.message
      else loadError = 'Failed to load tenants.'
    } finally {
      loading = false
    }
  }

  async function reactivate(slug: string) {
    reactivating = slug
    try {
      await apiCall(`/api/tenants/${encodeURIComponent(slug)}/reactivate`, { method: 'POST' })
      await search_tenants()
    } catch (err) {
      loadError = err instanceof ApiError ? err.message : 'Failed to reactivate tenant.'
    } finally {
      reactivating = undefined
    }
  }

  async function createTenant(event: SubmitEvent) {
    event.preventDefault()
    creating = true
    createError = undefined
    createResult = undefined
    const body: CreateTenantRequest = {
      slug: createSlug,
      name: createName,
      adminEmail: createAdminEmail,
      adminHost: createAdminHost || undefined,
    }
    try {
      createResult = await apiCall<CreateTenantResponse>('/api/tenants', { method: 'POST', body })
    } catch (err) {
      if (err instanceof ApiError) {
        const errBody = err.body as CreateTenantErrorBody | undefined
        // tower Story 012: failure mid-provisioning is expected, not
        // exceptional -- retrying the same slug is the correct recovery,
        // never "try a different slug" or "contact support".
        createError = errBody?.failedStep
          ? `Provisioning failed at step "${errBody.failedStep}": ${errBody.error}. Retry with the same slug "${createSlug}" -- provisioning resumes from where it stopped.`
          : `${err.message}. Retry with the same slug "${createSlug}" -- provisioning resumes from where it stopped.`
      } else {
        createError = 'Failed to create tenant.'
      }
    } finally {
      creating = false
    }
  }
</script>

<h1>Tenants</h1>

<section class="search">
  <form onsubmit={(e) => { e.preventDefault(); void search_tenants() }}>
    <input type="search" placeholder="search by slug or name" bind:value={search} />
    <button type="submit">Search</button>
  </form>
  <button type="button" onclick={() => (showCreate = !showCreate)}>Create Tenant</button>
</section>

{#if loadError}
  <p class="error" role="alert">{loadError}</p>
{/if}

{#if loading}
  <p>Loading...</p>
{:else}
  <table>
    <thead>
      <tr>
        <th>Slug</th>
        <th>Name</th>
        <th>Status</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each tenants as tenant (tenant.slug)}
        <tr>
          <td><a href={`/tenants/${encodeURIComponent(tenant.slug)}`}>{tenant.slug}</a></td>
          <td>{tenant.name}</td>
          <td>{tenant.status}</td>
          <td>
            {#if tenant.status === 'suspended'}
              <button type="button" disabled={reactivating === tenant.slug} onclick={() => reactivate(tenant.slug)}>
                {reactivating === tenant.slug ? 'Reactivating...' : 'Reactivate'}
              </button>
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="4">No tenants found.</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if showCreate}
  <section class="create">
    <h2>Create Tenant</h2>
    <form onsubmit={createTenant}>
      <label>Slug <input type="text" bind:value={createSlug} required /></label>
      <label>Name <input type="text" bind:value={createName} required /></label>
      <label>Admin email <input type="email" bind:value={createAdminEmail} required /></label>
      <label>Admin host override (optional) <input type="text" bind:value={createAdminHost} /></label>
      <button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
    </form>

    {#if createError}
      <p class="error" role="alert">{createError}</p>
    {/if}

    {#if createResult}
      <p class="confirmation">
        Tenant <strong>{createResult.slug}</strong> created. Admin host: <code>{createResult.adminHost}</code>.
        Invite email dispatched.
      </p>
    {/if}
  </section>
{/if}

<style>
  .search {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th, td {
    text-align: left;
    padding: 0.4rem;
    border-bottom: 1px solid #ddd;
  }
  .error {
    color: #b00020;
  }
  .create form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 24rem;
  }
</style>
