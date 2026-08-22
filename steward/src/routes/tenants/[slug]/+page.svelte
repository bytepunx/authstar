<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { session } from '$lib/client/session.svelte.js'
  import { apiCall, ApiError } from '$lib/client/api.js'
  import type {
    Account,
    AccountListResponse,
    Application,
    ApplicationListResponse,
    CreateApplicationRequest,
    CreateRoleDefinitionRequest,
    InviteRequest,
    InviteResponse,
    PermissionGrant,
    RoleDefinition,
    RoleDefinitionListResponse,
    RotateTenantKeysResponse,
    TenantDetailResponse,
    TenantRotationKey,
  } from '$lib/types.js'

  const slug = $derived(page.params.slug!)

  // -- Tenant detail (ADR 0091: domain -> authstar.<domain> admin URL) --
  let domain = $state<string | null | undefined>(undefined)
  let detailError = $state<string | undefined>(undefined)

  // -- Admin Access (Story 003) --------------------------------------
  let holders = $state<Account[]>([])
  let holdersLoading = $state(false)
  let holdersError = $state<string | undefined>(undefined)

  let emailSearch = $state('')
  let searchResults = $state<Account[]>([])
  let searching = $state(false)
  let searchError = $state<string | undefined>(undefined)

  let grantApplication = $state('')
  let grantGrant = $state('')
  let grantBusy = $state<string | undefined>(undefined)
  let grantError = $state<string | undefined>(undefined)

  // -- Invite an admin (ADR 0091) ---------------------------------------
  // Same permission set tower's own bootstrap invite grants
  // (provisioning.ts's FULL_TENANT_PERMISSIONS) -- this form is
  // specifically for onboarding tenant admins, not a general-purpose
  // product-invite UI with role/permission pickers.
  const FULL_TENANT_PERMISSIONS: PermissionGrant[] = [
    'roles:manage', 'permissions:manage', 'invite:send', 'invite:code:issue',
    'accounts:manage', 'applications:manage', 'providers:manage',
    'contacts:read', 'contacts:erase', 'contacts:export',
    'erasure-requests:read', 'activity:read', 'tenant:manage',
  ].map((grant) => ({ grant, scope: 'tenant' as const, maxOutstanding: null }))
  let inviteEmail = $state('')
  let inviting = $state(false)
  let inviteError = $state<string | undefined>(undefined)
  let inviteResult = $state<InviteResponse | undefined>(undefined)

  // -- Applications (bytepunx/authstar-tower#3's own prerequisite) ------
  let applications = $state<Application[]>([])
  let applicationsLoading = $state(false)
  let applicationsError = $state<string | undefined>(undefined)

  let newAppSlug = $state('')
  let newAppName = $state('')
  let newAppHosts = $state('')
  let creatingApp = $state(false)
  let createAppError = $state<string | undefined>(undefined)

  let deletingApp = $state<string | undefined>(undefined)
  let deleteAppError = $state<string | undefined>(undefined)

  // -- Role definitions (authstar-steward#1) ---------------------------
  let roleDefinitions = $state<RoleDefinition[]>([])
  let roleDefinitionsLoading = $state(false)
  let roleDefinitionsError = $state<string | undefined>(undefined)

  let newRoleName = $state('')
  let newRoleApplication = $state('')
  let creatingRole = $state(false)
  let createRoleError = $state<string | undefined>(undefined)

  let retiringRole = $state<string | undefined>(undefined)
  let retireRoleError = $state<string | undefined>(undefined)

  onMount(() => {
    if (!session.connected) {
      goto('/connect')
      return
    }
    void loadDetail()
    void loadHolders()
    void loadApplications()
    void loadRoleDefinitions()
  })

  async function loadDetail() {
    detailError = undefined
    try {
      const result = await apiCall<TenantDetailResponse>(`/api/tenants/${encodeURIComponent(slug)}`)
      domain = result.domain
    } catch (err) {
      detailError = err instanceof ApiError ? err.message : 'Failed to load tenant detail.'
    }
  }

  async function inviteAdmin(event: SubmitEvent) {
    event.preventDefault()
    inviting = true
    inviteError = undefined
    inviteResult = undefined
    const body: InviteRequest = { email: inviteEmail, permissions: FULL_TENANT_PERMISSIONS }
    try {
      inviteResult = await apiCall<InviteResponse>(`/api/tenants/${encodeURIComponent(slug)}/invites`, { method: 'POST', body })
      inviteEmail = ''
    } catch (err) {
      inviteError = err instanceof ApiError ? err.message : 'Failed to send invite.'
    } finally {
      inviting = false
    }
  }

  async function loadHolders() {
    holdersLoading = true
    holdersError = undefined
    try {
      const result = await apiCall<AccountListResponse>(`/api/tenants/${encodeURIComponent(slug)}/accounts`)
      holders = result.filter((a) => a.permissions && a.permissions.length > 0)
    } catch (err) {
      holdersError = err instanceof ApiError ? err.message : 'Failed to load admin access.'
    } finally {
      holdersLoading = false
    }
  }

  async function loadApplications() {
    applicationsLoading = true
    applicationsError = undefined
    try {
      applications = await apiCall<ApplicationListResponse>(`/api/tenants/${encodeURIComponent(slug)}/applications`)
    } catch (err) {
      applicationsError = err instanceof ApiError ? err.message : 'Failed to load applications.'
    } finally {
      applicationsLoading = false
    }
  }

  async function createApplication(event: SubmitEvent) {
    event.preventDefault()
    creatingApp = true
    createAppError = undefined
    const hosts = newAppHosts.split(',').map((h) => h.trim()).filter((h) => h.length > 0)
    const body: CreateApplicationRequest = { slug: newAppSlug, name: newAppName, hosts: hosts.length > 0 ? hosts : undefined }
    try {
      await apiCall(`/api/tenants/${encodeURIComponent(slug)}/applications`, { method: 'POST', body })
      newAppSlug = ''
      newAppName = ''
      newAppHosts = ''
      await loadApplications()
    } catch (err) {
      createAppError = err instanceof ApiError ? err.message : 'Failed to create application.'
    } finally {
      creatingApp = false
    }
  }

  async function deleteApplication(app: Application) {
    deletingApp = app.slug
    deleteAppError = undefined
    try {
      await apiCall(`/api/tenants/${encodeURIComponent(slug)}/applications/${encodeURIComponent(app.slug)}`, { method: 'DELETE' })
      await loadApplications()
    } catch (err) {
      deleteAppError = err instanceof ApiError ? err.message : 'Failed to delete application.'
    } finally {
      deletingApp = undefined
    }
  }

  async function loadRoleDefinitions() {
    roleDefinitionsLoading = true
    roleDefinitionsError = undefined
    try {
      roleDefinitions = await apiCall<RoleDefinitionListResponse>(`/api/tenants/${encodeURIComponent(slug)}/role-definitions`)
    } catch (err) {
      roleDefinitionsError = err instanceof ApiError ? err.message : 'Failed to load role definitions.'
    } finally {
      roleDefinitionsLoading = false
    }
  }

  async function createRoleDefinition(event: SubmitEvent) {
    event.preventDefault()
    creatingRole = true
    createRoleError = undefined
    const body: CreateRoleDefinitionRequest = {
      name: newRoleName,
      scope: newRoleApplication ? { application: newRoleApplication } : 'tenant',
    }
    try {
      await apiCall(`/api/tenants/${encodeURIComponent(slug)}/role-definitions`, { method: 'POST', body })
      newRoleName = ''
      newRoleApplication = ''
      await loadRoleDefinitions()
    } catch (err) {
      createRoleError = err instanceof ApiError ? err.message : 'Failed to create role definition.'
    } finally {
      creatingRole = false
    }
  }

  async function retireRoleDefinition(def: RoleDefinition) {
    retiringRole = def.name
    retireRoleError = undefined
    try {
      const query = typeof def.scope === 'object' ? `?applicationScope=${encodeURIComponent(def.scope.application)}` : ''
      await apiCall(
        `/api/tenants/${encodeURIComponent(slug)}/role-definitions/${encodeURIComponent(def.name)}${query}`,
        { method: 'DELETE' },
      )
      await loadRoleDefinitions()
    } catch (err) {
      retireRoleError = err instanceof ApiError ? err.message : 'Failed to retire role definition.'
    } finally {
      retiringRole = undefined
    }
  }

  async function searchByEmail(event: SubmitEvent) {
    event.preventDefault()
    searching = true
    searchError = undefined
    try {
      const result = await apiCall<AccountListResponse>(
        `/api/tenants/${encodeURIComponent(slug)}/accounts?email=${encodeURIComponent(emailSearch)}`,
      )
      searchResults = result
    } catch (err) {
      searchError = err instanceof ApiError ? err.message : 'Search failed.'
    } finally {
      searching = false
    }
  }

  async function grant(accountId: string) {
    grantBusy = accountId
    grantError = undefined
    const body: PermissionGrant = {
      grant: grantGrant,
      scope: grantApplication ? { application: grantApplication } : 'tenant',
      maxOutstanding: null,
    }
    try {
      await apiCall(`/api/tenants/${encodeURIComponent(slug)}/accounts/${encodeURIComponent(accountId)}/permissions`, {
        method: 'POST',
        body,
      })
      await loadHolders()
    } catch (err) {
      grantError = err instanceof ApiError ? err.message : 'Grant failed.'
    } finally {
      grantBusy = undefined
    }
  }

  async function revoke(accountId: string, p: PermissionGrant) {
    grantBusy = accountId
    grantError = undefined
    try {
      // tower reads scope from the query string, not the URL path
      // (routes/accounts.ts's removalQuerySchema) -- `?scope=tenant` or
      // `?applicationScope=<slug>`, never both.
      const query = typeof p.scope === 'object' ? `?applicationScope=${encodeURIComponent(p.scope.application)}` : '?scope=tenant'
      await apiCall(
        `/api/tenants/${encodeURIComponent(slug)}/accounts/${encodeURIComponent(accountId)}/permissions/${encodeURIComponent(p.grant)}${query}`,
        { method: 'DELETE' },
      )
      await loadHolders()
    } catch (err) {
      grantError = err instanceof ApiError ? err.message : 'Revoke failed.'
    } finally {
      grantBusy = undefined
    }
  }

  // -- Rotate Tenant Keys (Story 005) ----------------------------------
  const ROTATION_KEYS: TenantRotationKey[] = ['session', 'internal', 'identity-hash']
  let selectedKeys = $state<Record<TenantRotationKey, boolean>>({ session: false, internal: false, 'identity-hash': false })
  let confirmingRotation = $state(false)
  let confirmationTyped = $state('')
  let rotating = $state(false)
  let rotateError = $state<string | undefined>(undefined)
  let rotateResult = $state<RotateTenantKeysResponse | undefined>(undefined)

  const anyKeySelected = $derived(Object.values(selectedKeys).some(Boolean))
  const sessionSelected = $derived(selectedKeys.session)

  function openConfirm() {
    confirmationTyped = ''
    rotateError = undefined
    rotateResult = undefined
    confirmingRotation = true
  }

  async function confirmRotate() {
    rotating = true
    rotateError = undefined
    try {
      const keys = ROTATION_KEYS.filter((k) => selectedKeys[k])
      rotateResult = await apiCall<RotateTenantKeysResponse>(`/api/tenants/${encodeURIComponent(slug)}/rotate-keys`, {
        method: 'POST',
        body: { keys },
      })
      confirmingRotation = false
    } catch (err) {
      rotateError = err instanceof ApiError ? err.message : 'Rotation failed.'
    } finally {
      rotating = false
    }
  }
</script>

<h1>Tenant: {slug}</h1>

{#if detailError}
  <p class="error" role="alert">{detailError}</p>
{:else if domain}
  <p class="admin-url">
    Admin console: <a href={`https://authstar.${domain}`} target="_blank" rel="noopener">authstar.{domain}</a>
  </p>
{/if}

<section>
  <h2>Admin Access</h2>

  {#if holdersError}
    <p class="error" role="alert">{holdersError}</p>
  {/if}

  {#if holdersLoading}
    <p>Loading...</p>
  {:else}
    <h3>Current permission holders</h3>
    <ul>
      {#each holders as holder (holder.id)}
        <li>
          {holder.email ?? holder.id}
          <ul>
            {#each holder.permissions as p}
              <li>
                {typeof p.scope === 'object' ? p.scope.application : 'tenant-wide'}: {p.grant}
                <button
                  type="button"
                  disabled={grantBusy === holder.id}
                  onclick={() => revoke(holder.id, p)}
                >
                  Revoke
                </button>
              </li>
            {/each}
          </ul>
        </li>
      {:else}
        <li>No accounts currently hold elevated permissions.</li>
      {/each}
    </ul>
  {/if}

  <h3>Recovery: grant/revoke on an existing account</h3>
  <form onsubmit={searchByEmail}>
    <input type="email" placeholder="account email" bind:value={emailSearch} required />
    <button type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
  </form>
  {#if searchError}
    <p class="error" role="alert">{searchError}</p>
  {/if}
  {#each searchResults as account (account.id)}
    <div class="account-row">
      <span>{account.email ?? account.id}</span>
      <input type="text" placeholder="application slug (blank = tenant-wide)" bind:value={grantApplication} />
      <input type="text" placeholder="grant, e.g. tenant:manage" bind:value={grantGrant} />
      <button type="button" disabled={grantBusy === account.id || !grantGrant} onclick={() => grant(account.id)}>
        Grant
      </button>
    </div>
  {/each}
  {#if grantError}
    <p class="error" role="alert">{grantError}</p>
  {/if}

  <h3>Invite an admin</h3>
  <form onsubmit={inviteAdmin}>
    <input type="email" placeholder="new admin's email" bind:value={inviteEmail} required />
    <button type="submit" disabled={inviting}>{inviting ? 'Sending...' : 'Send invite'}</button>
  </form>
  {#if inviteError}
    <p class="error" role="alert">{inviteError}</p>
  {/if}
  {#if inviteResult}
    <p class="confirmation">Invite sent to <strong>{inviteResult.email}</strong>.</p>
  {/if}
</section>

<section>
  <h2>Rotate Tenant Keys</h2>
  <fieldset>
    <legend>Select keys to rotate</legend>
    {#each ROTATION_KEYS as key}
      <label>
        <input type="checkbox" bind:checked={selectedKeys[key]} />
        {key}
      </label>
    {/each}
  </fieldset>

  <button type="button" disabled={!anyKeySelected} onclick={openConfirm}>Rotate selected keys</button>

  {#if confirmingRotation}
    <div class="confirm-dialog" role="dialog" aria-label="Confirm key rotation">
      <p>
        You are about to rotate: <strong>{ROTATION_KEYS.filter((k) => selectedKeys[k]).join(', ')}</strong>.
      </p>
      {#if sessionSelected}
        <p class="warning">
          Rotating <strong>session</strong> starts a countdown: every un-refreshed browser session will
          eventually need a fresh login once its cookie outlives the overlap window. This is not
          reversible once the overlap window elapses.
        </p>
      {/if}
      {#if selectedKeys['identity-hash']}
        <p>
          Rotating <strong>identity-hash</strong> is not an immediate cutover -- old generations
          remain valid until their own retention window naturally elapses.
        </p>
      {/if}
      <p>Type <code>{slug}</code> to confirm.</p>
      <input type="text" bind:value={confirmationTyped} placeholder={slug} />
      <button type="button" disabled={confirmationTyped !== slug || rotating} onclick={confirmRotate}>
        {rotating ? 'Rotating...' : 'Confirm rotation'}
      </button>
      <button type="button" onclick={() => (confirmingRotation = false)}>Cancel</button>
    </div>
  {/if}

  {#if rotateError}
    <p class="error" role="alert">{rotateError}</p>
  {/if}

  {#if rotateResult}
    {#if rotateResult.rotated.length > 0}
      <p class="confirmation">
        Rotated: {rotateResult.rotated.map((r) => r.key).join(', ')}.
        {#if rotateResult.rotated.some((r) => r.key === 'identity-hash')}
          Old identity-hash generations remain valid until their retention window elapses.
        {/if}
      </p>
    {/if}
    {#if rotateResult.failed.length > 0}
      <p class="error" role="alert">
        Failed to rotate: {rotateResult.failed.map((f) => `${f.key} (${f.error})`).join(', ')}.
      </p>
    {/if}
  {/if}
</section>

<section>
  <h2>Applications</h2>

  {#if applicationsError}
    <p class="error" role="alert">{applicationsError}</p>
  {/if}

  {#if applicationsLoading}
    <p>Loading...</p>
  {:else}
    <ul>
      {#each applications as application (application.slug)}
        <li>
          {application.slug} -- {application.name} ({application.status})
          {#if application.hosts.length > 0}
            [{application.hosts.join(', ')}]
          {/if}
          {#if application.status !== 'deleted'}
            <button
              type="button"
              disabled={deletingApp === application.slug}
              onclick={() => deleteApplication(application)}
            >
              Delete
            </button>
          {/if}
        </li>
      {:else}
        <li>No applications registered yet.</li>
      {/each}
    </ul>
  {/if}
  {#if deleteAppError}
    <p class="error" role="alert">{deleteAppError}</p>
  {/if}

  <h3>Register an application</h3>
  <form onsubmit={createApplication}>
    <input type="text" placeholder="application slug, e.g. loci" bind:value={newAppSlug} required />
    <input type="text" placeholder="display name" bind:value={newAppName} required />
    <input type="text" placeholder="hosts, comma-separated (optional)" bind:value={newAppHosts} />
    <button type="submit" disabled={creatingApp || !newAppSlug || !newAppName}>
      {creatingApp ? 'Registering...' : 'Register'}
    </button>
  </form>
  {#if createAppError}
    <p class="error" role="alert">{createAppError}</p>
  {/if}
</section>

<section>
  <h2>Role Definitions</h2>

  {#if roleDefinitionsError}
    <p class="error" role="alert">{roleDefinitionsError}</p>
  {/if}

  {#if roleDefinitionsLoading}
    <p>Loading...</p>
  {:else}
    <ul>
      {#each roleDefinitions as def (def.name + JSON.stringify(def.scope))}
        <li>
          {typeof def.scope === 'object' ? def.scope.application : 'tenant-wide'}: {def.name}
          ({def.status})
          {#if def.status === 'active'}
            <button
              type="button"
              disabled={retiringRole === def.name}
              onclick={() => retireRoleDefinition(def)}
            >
              Retire
            </button>
          {/if}
        </li>
      {:else}
        <li>No role definitions yet.</li>
      {/each}
    </ul>
  {/if}
  {#if retireRoleError}
    <p class="error" role="alert">{retireRoleError}</p>
  {/if}

  <h3>Create a role definition</h3>
  <form onsubmit={createRoleDefinition}>
    <input type="text" placeholder="role name, e.g. plan:family" bind:value={newRoleName} required />
    <input type="text" placeholder="application slug (blank = tenant-wide)" bind:value={newRoleApplication} />
    <button type="submit" disabled={creatingRole || !newRoleName}>{creatingRole ? 'Creating...' : 'Create'}</button>
  </form>
  {#if createRoleError}
    <p class="error" role="alert">{createRoleError}</p>
  {/if}
</section>

<style>
  .error { color: #b00020; }
  .admin-url { margin-bottom: 1rem; }
  .warning { color: #9a6700; font-weight: bold; }
  .confirm-dialog {
    border: 2px solid #b00020;
    padding: 1rem;
    margin-top: 0.5rem;
    max-width: 32rem;
  }
  .account-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin: 0.25rem 0;
  }
</style>
