import type { GrantedRole } from './clients/keep'

// Shared between the new-mapping and edit-mapping forms -- both accept the
// same "application:role, application:role" comma-separated convention the
// applications/new form already uses for hosts/exemptPaths/etc.
//
// Splits only on the FIRST colon in each entry -- role names are an open,
// app-owned vocabulary (ADR 0069) that routinely contain colons themselves
// (e.g. tower's own "plan:business"), so splitting on every colon would
// silently truncate those at the second one.
export function parseGrantedRoles(value: FormDataEntryValue | null): { roles: GrantedRole[]; invalid: string[] } {
	if (typeof value !== 'string' || value.trim() === '') return { roles: [], invalid: [] }
	const roles: GrantedRole[] = []
	const invalid: string[] = []
	for (const entry of value.split(',').map((e) => e.trim()).filter(Boolean)) {
		const sep = entry.indexOf(':')
		const application = sep === -1 ? '' : entry.slice(0, sep).trim()
		const role = sep === -1 ? '' : entry.slice(sep + 1).trim()
		if (!application || !role) {
			invalid.push(entry)
			continue
		}
		roles.push({ application, role })
	}
	return { roles, invalid }
}

export function formatGrantedRoles(roles: readonly GrantedRole[]): string {
	return roles.map((r) => `${r.application}:${r.role}`).join(', ')
}
