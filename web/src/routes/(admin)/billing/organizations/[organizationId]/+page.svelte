<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const org = $derived(data.organization)
	const managers = $derived(new Set(org.managers))
</script>

<h1 class="text-xl font-semibold">{org.name}</h1>
<p class="text-sm text-slate-500">organization id: {org.organizationId}</p>

{#if form?.formError}
	<p class="mt-4 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}
{#if form?.success && !form?.invited}
	<p class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700" role="status">Saved.</p>
{/if}
{#if form?.invited}
	<p class="mt-4 rounded bg-green-50 p-3 text-sm text-green-700" role="status">Invite sent.</p>
{/if}

<section class="mt-8 max-w-2xl">
	<h2 class="text-lg font-semibold">Managers</h2>
	<p class="text-sm text-slate-600">
		Full control -- can add/remove co-managers, remove members, and send invites. Each manager
		designates their own successor; that's a self-service action only, not shown as editable
		here.
	</p>
	<ul class="mt-2 divide-y divide-slate-100 text-sm">
		{#each org.managers as accountId (accountId)}
			<li class="flex items-center justify-between py-2">
				<span>
					{accountId}
					{#if org.successors[accountId]}
						<span class="text-slate-500">-- successor: {org.successors[accountId]}</span>
					{/if}
				</span>
				<form method="POST" action="?/removeManager">
					<input type="hidden" name="accountId" value={accountId} />
					<button type="submit" class="text-red-600 underline">Remove</button>
				</form>
			</li>
		{/each}
	</ul>

	<form method="POST" action="?/addManager" class="mt-4 flex items-end gap-2">
		<label class="flex flex-col gap-1 text-sm">
			Promote an existing member to co-manager
			<input name="accountId" placeholder="accountId" class="rounded border border-slate-300 px-2 py-1" />
		</label>
		<button type="submit" class="rounded border border-slate-300 px-3 py-1.5 text-sm">Add manager</button>
	</form>
</section>

<section class="mt-8 max-w-2xl">
	<h2 class="text-lg font-semibold">Members</h2>
	{#if data.members.length === 0}
		<p class="mt-2 text-sm text-slate-600">No members yet.</p>
	{:else}
		<ul class="mt-2 divide-y divide-slate-100 text-sm">
			{#each data.members as member (member.accountId)}
				<li class="flex items-center justify-between py-2">
					<span>
						{member.accountId}
						{#if managers.has(member.accountId)}
							<span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">manager</span>
						{/if}
					</span>
					<form method="POST" action="?/removeMember">
						<input type="hidden" name="accountId" value={member.accountId} />
						<button type="submit" class="text-red-600 underline">Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="mt-8 max-w-2xl">
	<h2 class="text-lg font-semibold">Billing access</h2>
	<p class="text-sm text-slate-600">
		A narrower right than co-manager -- reaches keep's Billing Portal for this organization's
		subscription without granting anything else (ADR 0090/0098). Only a manager can grant or
		revoke it. There's no read-back of who currently holds it yet (tower's account listing
		doesn't expose permissions) -- grant/revoke act blind, same as a fresh page load would show.
	</p>
	<div class="mt-2 flex flex-col gap-2 sm:flex-row">
		<form method="POST" action="?/grantBillingAccess" class="flex items-end gap-2">
			<label class="flex flex-col gap-1 text-sm">
				Grant to
				<input name="accountId" placeholder="accountId" class="rounded border border-slate-300 px-2 py-1" />
			</label>
			<button type="submit" class="rounded border border-slate-300 px-3 py-1.5 text-sm">Grant</button>
		</form>
		<form method="POST" action="?/revokeBillingAccess" class="flex items-end gap-2">
			<label class="flex flex-col gap-1 text-sm">
				Revoke from
				<input name="accountId" placeholder="accountId" class="rounded border border-slate-300 px-2 py-1" />
			</label>
			<button type="submit" class="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700">Revoke</button>
		</form>
	</div>
</section>

<section class="mt-8 max-w-2xl">
	<h2 class="text-lg font-semibold">Invite a new member</h2>
	<form method="POST" action="?/invite" class="mt-2 flex flex-col gap-4">
		<label class="flex flex-col gap-1 text-sm">
			Contact id
			<input name="contactId" placeholder="contactId" class="rounded border border-slate-300 px-2 py-1" />
		</label>
		<fieldset class="flex flex-col gap-1 text-sm">
			<legend>Role on acceptance</legend>
			<label class="flex items-center gap-2">
				<input type="radio" name="organizationRole" value="member" checked />
				Member
			</label>
			<label class="flex items-center gap-2">
				<input type="radio" name="organizationRole" value="manager" />
				Co-manager
			</label>
		</fieldset>
		<button type="submit" class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Send invite</button>
	</form>
</section>
