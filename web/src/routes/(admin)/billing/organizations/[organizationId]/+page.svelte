<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const org = $derived(data.organization)
	const managers = $derived(new Set(data.members.filter((m) => m.roles.includes('manager')).map((m) => m.accountId)))
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
	<h2 class="text-lg font-semibold">Members</h2>
	{#if data.members.length === 0}
		<p class="mt-2 text-sm text-slate-600">No members yet.</p>
	{:else}
		<ul class="mt-2 divide-y divide-slate-100 text-sm">
			{#each data.members as member (member.membershipId)}
				<li class="flex items-center justify-between py-2">
					<span>
						{member.accountId}
						{#each member.roles.filter((r) => r !== 'member') as role (role)}
							<span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{role}</span>
						{/each}
						{#if managers.has(member.accountId) && member.successorAccountId}
							<span class="text-slate-500">-- successor: {member.successorAccountId}</span>
						{/if}
					</span>
					<span class="flex items-center gap-3">
						{#each data.roleCatalog.filter((r) => r.name !== 'member') as roleDef (roleDef.name)}
							{#if member.roles.includes(roleDef.name)}
								<form method="POST" action="?/revokeRole">
									<input type="hidden" name="accountId" value={member.accountId} />
									<input type="hidden" name="role" value={roleDef.name} />
									<button type="submit" class="text-slate-500 underline">-{roleDef.name}</button>
								</form>
							{:else}
								<form method="POST" action="?/grantRole">
									<input type="hidden" name="accountId" value={member.accountId} />
									<input type="hidden" name="role" value={roleDef.name} />
									<button type="submit" class="text-slate-500 underline">+{roleDef.name}</button>
								</form>
							{/if}
						{/each}
						<form method="POST" action="?/removeMember">
							<input type="hidden" name="accountId" value={member.accountId} />
							<button type="submit" class="text-red-600 underline">Remove</button>
						</form>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
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
			{#each data.roleCatalog as roleDef (roleDef.name)}
				<label class="flex items-center gap-2">
					<input type="radio" name="organizationRole" value={roleDef.name} checked={roleDef.name === 'member'} />
					{roleDef.name}
				</label>
			{/each}
		</fieldset>
		<button type="submit" class="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">Send invite</button>
	</form>
</section>
