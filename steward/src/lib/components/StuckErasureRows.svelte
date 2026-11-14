<script lang="ts">
  // Story 004: one table of stuck erasure requests (ADR 0075), shared by
  // the top-level Stuck Erasures view and the tenant page's section. Each
  // row names the services that have not acknowledged the request: the
  // detail an operator needs to know what to go fix. `showTenant` drops
  // the tenant column where the tenant is already the page's context.
  import type { StuckErasureRequest } from '#lib/types.js'

  let { requests, showTenant = true }: { requests: StuckErasureRequest[]; showTenant?: boolean } = $props()
</script>

<table class="stuck-erasures">
  <thead>
    <tr>
      {#if showTenant}<th scope="col">Tenant</th>{/if}
      <th scope="col">Contact</th>
      <th scope="col">Requested at</th>
      <th scope="col">Outstanding services</th>
    </tr>
  </thead>
  <tbody>
    {#each requests as request (request.tenant + '/' + request.contactId)}
      <tr>
        {#if showTenant}
          <td><a href={`/tenants/${encodeURIComponent(request.tenant)}`}>{request.tenant}</a></td>
        {/if}
        <td>{request.contactId}</td>
        <td><time datetime={request.requestedAt}>{request.requestedAt}</time></td>
        <td>{request.outstandingServices.join(', ')}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .stuck-erasures {
    border-collapse: collapse;
    margin: 0.25rem 0 1rem;
  }
  .stuck-erasures th,
  .stuck-erasures td {
    text-align: left;
    padding: 0.25rem 0.75rem 0.25rem 0;
  }
</style>
