<script lang="ts">
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const org = $derived(data.organization)
	const self = $derived(data.members.find((m) => m.accountId === data.session.accountId))
</script>

<h1 class="text-lg font-semibold authstar-embed-primary">{org.name}</h1>

{#if form?.formError}
	<p class="mt-3 rounded bg-red-50 p-3 text-sm text-red-700" role="alert">{form.formError}</p>
{/if}
{#if form?.success && !form?.invited && !form?.left}
	<p class="mt-3 rounded bg-green-50 p-3 text-sm text-green-700" role="status">Saved.</p>
{/if}
{#if form?.invited}
	<p class="mt-3 rounded bg-green-50 p-3 text-sm text-green-700" role="status">Invite sent.</p>
{/if}
{#if form?.left}
	<p class="mt-3 rounded bg-green-50 p-3 text-sm text-green-700" role="status">You've left this organization.</p>
{/if}

<section class="mt-6">
	<h2 class="text-sm font-semibold text-slate-500">Members</h2>
	<ul class="mt-2 divide-y divide-slate-100 text-sm">
		{#each data.members as member (member.membershipId)}
			<li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
				<span>
					{member.accountId}
					{#if member.accountId === data.session.accountId}
						<span class="text-slate-400">(you)</span>
					{/if}
					{#each member.roles.filter((r) => r !== 'member') as role (role)}
						<span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{role}</span>
					{/each}
				</span>
				<span class="flex flex-wrap items-center gap-3">
					{#if data.isManager}
						{#each data.roleCatalog.filter((r) => r.name !== 'member') as roleDef (roleDef.name)}
							{#if member.roles.includes(roleDef.name)}
								<form method="POST" action="?/revokeRole">
									<input type="hidden" name="accountId" value={member.accountId} />
									<input type="hidden" name="role" value={roleDef.name} />
									<button type="submit" class="text-xs text-slate-500 underline">-{roleDef.name}</button>
								</form>
							{:else}
								<form method="POST" action="?/grantRole">
									<input type="hidden" name="accountId" value={member.accountId} />
									<input type="hidden" name="role" value={roleDef.name} />
									<button type="submit" class="text-xs text-slate-500 underline">+{roleDef.name}</button>
								</form>
							{/if}
						{/each}
					{/if}
					{#if data.isManager || member.accountId === data.session.accountId}
						<form method="POST" action="?/removeMember">
							<input type="hidden" name="accountId" value={member.accountId} />
							<button type="submit" class="text-xs text-red-600 underline">
								{member.accountId === data.session.accountId ? 'Leave' : 'Remove'}
							</button>
						</form>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</section>

{#if self?.roles.includes('manager')}
	<section class="mt-6 max-w-md">
		<h2 class="text-sm font-semibold text-slate-500">Your successor</h2>
		<p class="mt-1 text-xs text-slate-500">
			If you're ever removed as the organization's only manager, your designated successor is
			promoted automatically.
		</p>
		{#if self.successorAccountId}
			<div class="mt-2 text-sm">
				Currently: <span class="font-medium">{self.successorAccountId}</span>
				<form method="POST" action="?/clearSuccessor" class="mt-1">
					<button type="submit" class="text-xs text-slate-500 underline">Clear</button>
				</form>
			</div>
		{:else}
			<form method="POST" action="?/setSuccessor" class="mt-2 flex items-end gap-2">
				<label class="flex flex-col gap-1 text-xs">
					accountId
					<input name="successorAccountId" class="rounded border border-slate-300 px-2 py-1 text-sm" />
				</label>
				<button type="submit" class="rounded border border-slate-300 px-3 py-1.5 text-xs">Set</button>
			</form>
		{/if}
	</section>
{/if}

{#if data.isManager}
	<section class="mt-6 max-w-md">
		<h2 class="text-sm font-semibold text-slate-500">Invite a new member</h2>
		<form method="POST" action="?/invite" class="mt-2 flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-xs">
				Email
				<input name="email" type="email" class="rounded border border-slate-300 px-2 py-1 text-sm" />
			</label>
			<fieldset class="flex flex-col gap-1 text-xs">
				<legend>Role on acceptance</legend>
				{#each data.roleCatalog as roleDef (roleDef.name)}
					<label class="flex items-center gap-2">
						<input type="radio" name="organizationRole" value={roleDef.name} checked={roleDef.name === 'member'} />
						{roleDef.name}
					</label>
				{/each}
			</fieldset>
			<button type="submit" class="w-fit rounded px-3 py-1.5 text-sm text-white authstar-embed-primary-bg">Send invite</button>
		</form>
	</section>
{/if}
