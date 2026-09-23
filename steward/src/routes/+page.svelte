<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { session } from '$lib/client/session.svelte.js'

  onMount(() => {
    goto(session.connected ? '/tenants' : '/connect')
  })
</script>
