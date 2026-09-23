<script lang="ts">
  import { session } from '$lib/client/session.svelte.js'
  import { goto } from '$app/navigation'

  let { children } = $props()

  function disconnect() {
    session.disconnect()
    goto('/connect')
  }
</script>

<div class="shell">
  <header>
    <strong>steward</strong>
    {#if session.connected}
      <nav>
        <a href="/tenants">Tenants</a>
      </nav>
      <span class="acting-as">acting as: {session.actorLabel}</span>
      <button type="button" onclick={disconnect}>Disconnect</button>
    {/if}
  </header>
  <main>
    {@render children()}
  </main>
</div>

<style>
  .shell {
    font-family: system-ui, sans-serif;
    max-width: 960px;
    margin: 0 auto;
    padding: 1rem;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid #ccc;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }
  .acting-as {
    margin-left: auto;
    color: #555;
    font-size: 0.9rem;
  }
</style>
